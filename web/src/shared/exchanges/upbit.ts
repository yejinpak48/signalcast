import { decodeMessageText, isPositiveFiniteNumber, isRecord, parseJsonSafely } from './messageParsing'
import type { ReconnectDelayOptions } from './reconnectDelay'
import { ReconnectingSocket } from './reconnectingSocket'
import type { ExchangePriceSource, PriceTick } from './types'

export const UPBIT_WEBSOCKET_URL = 'wss://api.upbit.com/websocket/v1'

/**
 * 업비트는 Origin 헤더가 있는 요청(브라우저 요청)을 시세 REST·WebSocket 모두 10초당 1회로 제한한다.
 * 그래서 재연결은 최소 10초 간격을 지킨다. (docs.upbit.com 요청 수 제한 안내, 2024-07-17 공지)
 */
export const UPBIT_RECONNECT_DELAY: ReconnectDelayOptions = {
  baseDelayMs: 10_000,
  maxDelayMs: 60_000,
  jitterRatio: 0.25,
  minimumDelayMs: 10_000,
}

/** 업비트는 120초 동안 주고받은 데이터가 없으면 연결을 끊으므로 그보다 짧은 간격으로 PING을 보낸다. */
const UPBIT_HEARTBEAT_INTERVAL_MS = 60_000
const UPBIT_STALE_TIMEOUT_MS = 30_000

export type UpbitMessage =
  | { kind: 'priceTick'; priceTick: PriceTick }
  | { kind: 'error'; errorMessage: string }
  | { kind: 'ignored' }

/** ticker 구독 요청 메시지. 마켓 코드는 대문자여야 한다. */
export function createUpbitSubscriptionMessage(symbols: readonly string[], ticket: string): string {
  return JSON.stringify([
    { ticket },
    { type: 'ticker', codes: symbols.map((symbol) => symbol.toUpperCase()) },
    { format: 'DEFAULT' },
  ])
}

/**
 * 업비트 WebSocket 메시지를 해석한다.
 * @param receivedAt 메시지에 체결 시각이 없을 때 대신 쓸 수신 시각
 */
export function parseUpbitMessage(data: unknown, receivedAt: number): UpbitMessage {
  const text = decodeMessageText(data)
  if (text === null) return { kind: 'ignored' }
  const message = parseJsonSafely(text)
  if (!isRecord(message)) return { kind: 'ignored' }

  // 예: {"error":{"name":"TOO_MANY_REQUEST","message":"..."}}
  if (isRecord(message['error'])) {
    const errorName = message['error']['name']
    const errorMessage = message['error']['message']
    return {
      kind: 'error',
      errorMessage: [errorName, errorMessage].filter((part) => typeof part === 'string').join(': ') || '알 수 없는 오류',
    }
  }

  // PING 응답 {"status":"UP"} 등은 무시한다.
  if (message['type'] !== 'ticker') return { kind: 'ignored' }
  const symbol = message['code']
  const price = message['trade_price']
  if (typeof symbol !== 'string' || !isPositiveFiniteNumber(price)) return { kind: 'ignored' }

  const tradeTimestamp = message['trade_timestamp']
  const messageTimestamp = message['timestamp']
  const tradedAt = isPositiveFiniteNumber(tradeTimestamp)
    ? tradeTimestamp
    : isPositiveFiniteNumber(messageTimestamp)
      ? messageTimestamp
      : receivedAt

  return { kind: 'priceTick', priceTick: { exchange: 'upbit', symbol, price, tradedAt } }
}

/** 업비트 요청 구분용 티켓. crypto.randomUUID는 HTTPS에서만 동작하므로 getRandomValues를 쓴다. */
function createTicket(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(8))
  const randomHex = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `signalcast-${randomHex}`
}

/** 업비트 공개 WebSocket ticker 채널 */
export const upbitPriceSource: ExchangePriceSource = {
  id: 'upbit',
  displayName: '업비트',

  subscribeToPrices(symbols, { onPriceTick, onStatusChange }) {
    const socket = new ReconnectingSocket({
      endpointUrls: [UPBIT_WEBSOCKET_URL],
      binaryType: 'arraybuffer',
      staleTimeoutMs: UPBIT_STALE_TIMEOUT_MS,
      heartbeat: { intervalMs: UPBIT_HEARTBEAT_INTERVAL_MS, payload: 'PING' },
      reconnectDelay: UPBIT_RECONNECT_DELAY,
      onOpen(openedSocket) {
        openedSocket.send(createUpbitSubscriptionMessage(symbols, createTicket()))
      },
      onMessage(data) {
        const message = parseUpbitMessage(data, Date.now())
        if (message.kind === 'priceTick') onPriceTick(message.priceTick)
        // 오류 응답 뒤에는 업비트가 연결을 끊고, 재연결은 ReconnectingSocket이 처리한다.
        if (message.kind === 'error') console.warn(`[업비트] ${message.errorMessage}`)
      },
      onStatusChange,
    })
    socket.start()
    return () => socket.stop()
  },
}
