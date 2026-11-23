import { isPositiveFiniteNumber, isRecord, parseJsonSafely } from './messageParsing'
import type { ReconnectDelayOptions } from './reconnectDelay'
import { ReconnectingSocket } from './reconnectingSocket'
import type { ExchangePriceSource, PriceTick } from './types'

/**
 * 바이낸스 시장 데이터 WebSocket 주소. 앞에서부터 시도하고, 연결이 열리지 않으면 다음 주소로 넘어간다.
 * data-stream.binance.vision은 공식 시장 데이터 전용 주소다.
 * (과거 데이터 아카이브인 data.binance.vision과는 다른 곳이며, 아카이브는 쓰지 않는다.)
 */
const BINANCE_STREAM_BASE_URLS = [
  'wss://stream.binance.com:9443',
  'wss://stream.binance.com:443',
  'wss://data-stream.binance.vision',
] as const

/** 바이낸스 연결 시도 제한은 IP당 5분에 300회라 짧은 간격으로 다시 연결해도 된다. */
export const BINANCE_RECONNECT_DELAY: ReconnectDelayOptions = {
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  jitterRatio: 0.25,
  minimumDelayMs: 0,
}

/** 바이낸스 서버는 20초마다 ping 프레임을 보내고 브라우저가 자동으로 응답하므로 따로 보낼 메시지는 없다. */
const BINANCE_STALE_TIMEOUT_MS = 20_000

export type BinanceMessage =
  | { kind: 'priceTick'; priceTick: PriceTick }
  | { kind: 'serverShutdown' }
  | { kind: 'ignored' }

/** 결합 스트림 주소 목록. 예: wss://stream.binance.com:9443/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade */
export function createBinanceCombinedStreamUrls(symbols: readonly string[]): [string, ...string[]] {
  const streamNames = symbols.map((symbol) => `${symbol.toLowerCase()}@aggTrade`).join('/')
  const [firstBaseUrl, ...otherBaseUrls] = BINANCE_STREAM_BASE_URLS
  const toStreamUrl = (baseUrl: string) => `${baseUrl}/stream?streams=${streamNames}`
  return [toStreamUrl(firstBaseUrl), ...otherBaseUrls.map(toStreamUrl)]
}

/** 결합 스트림 메시지 {"stream": "...", "data": {...}}를 해석한다. */
export function parseBinanceMessage(data: unknown): BinanceMessage {
  if (typeof data !== 'string') return { kind: 'ignored' }
  const message = parseJsonSafely(data)
  if (!isRecord(message)) return { kind: 'ignored' }
  const payload = isRecord(message['data']) ? message['data'] : message

  // 서버 종료 예고. 받으면 바로 다시 연결해야 한다.
  if (payload['e'] === 'serverShutdown') return { kind: 'serverShutdown' }
  if (payload['e'] !== 'aggTrade') return { kind: 'ignored' }

  const symbol = payload['s']
  const priceText = payload['p']
  const tradedAt = payload['T']
  if (typeof symbol !== 'string' || typeof priceText !== 'string' || !isPositiveFiniteNumber(tradedAt)) {
    return { kind: 'ignored' }
  }
  const price = Number(priceText)
  if (!isPositiveFiniteNumber(price)) return { kind: 'ignored' }

  return { kind: 'priceTick', priceTick: { exchange: 'binance', symbol, price, tradedAt } }
}

/** 바이낸스 공개 WebSocket aggTrade 결합 스트림 (체결마다 갱신) */
export const binancePriceSource: ExchangePriceSource = {
  id: 'binance',
  displayName: '바이낸스',

  subscribeToPrices(symbols, { onPriceTick, onStatusChange }) {
    const socket = new ReconnectingSocket({
      endpointUrls: createBinanceCombinedStreamUrls(symbols),
      binaryType: null,
      staleTimeoutMs: BINANCE_STALE_TIMEOUT_MS,
      heartbeat: null,
      reconnectDelay: BINANCE_RECONNECT_DELAY,
      onOpen() {
        // 구독할 스트림이 주소에 들어 있으므로 따로 보낼 메시지가 없다.
      },
      onMessage(data) {
        const message = parseBinanceMessage(data)
        if (message.kind === 'priceTick') onPriceTick(message.priceTick)
        if (message.kind === 'serverShutdown') socket.restart('바이낸스 서버 종료 예고')
      },
      onStatusChange,
    })
    socket.start()
    return () => socket.stop()
  },
}
