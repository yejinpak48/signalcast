import { describe, expect, it } from 'vitest'
import { createBinanceCombinedStreamUrls, parseBinanceMessage } from './binance'

describe('createBinanceCombinedStreamUrls', () => {
  it('소문자 aggTrade 결합 스트림 주소를 기본 주소 → 대체 주소 순서로 만든다', () => {
    expect(createBinanceCombinedStreamUrls(['BTCUSDT', 'ETHUSDT'])).toEqual([
      'wss://stream.binance.com:9443/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade',
      'wss://stream.binance.com:443/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade',
      'wss://data-stream.binance.vision/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade',
    ])
  })

  it('과거 데이터 아카이브 도메인(data.binance.vision)은 쓰지 않는다', () => {
    for (const url of createBinanceCombinedStreamUrls(['BTCUSDT'])) {
      expect(new URL(url).hostname).not.toBe('data.binance.vision')
    }
  })
})

describe('parseBinanceMessage', () => {
  const aggTradeMessage = {
    stream: 'btcusdt@aggTrade',
    data: { e: 'aggTrade', E: 1_700_000_000_200, s: 'BTCUSDT', a: 1, p: '97000.50', q: '0.01', T: 1_700_000_000_100 },
  }

  it('결합 스트림 aggTrade 메시지에서 가격과 체결 시각을 꺼낸다', () => {
    expect(parseBinanceMessage(JSON.stringify(aggTradeMessage))).toEqual({
      kind: 'priceTick',
      priceTick: { exchange: 'binance', symbol: 'BTCUSDT', price: 97_000.5, tradedAt: 1_700_000_000_100 },
    })
  })

  it('숫자가 아닌 가격, 다른 이벤트, 잘못된 JSON은 무시한다', () => {
    const invalidPrice = { ...aggTradeMessage, data: { ...aggTradeMessage.data, p: 'abc' } }
    expect(parseBinanceMessage(JSON.stringify(invalidPrice))).toEqual({ kind: 'ignored' })
    expect(parseBinanceMessage(JSON.stringify({ stream: 'x', data: { e: 'kline' } }))).toEqual({ kind: 'ignored' })
    expect(parseBinanceMessage('not json')).toEqual({ kind: 'ignored' })
  })

  it('서버 종료 예고를 알아본다', () => {
    expect(parseBinanceMessage(JSON.stringify({ e: 'serverShutdown', E: 1 }))).toEqual({ kind: 'serverShutdown' })
    expect(parseBinanceMessage(JSON.stringify({ stream: 'x', data: { e: 'serverShutdown' } }))).toEqual({
      kind: 'serverShutdown',
    })
  })
})
