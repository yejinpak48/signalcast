import { describe, expect, it } from 'vitest'
import { createUpbitSubscriptionMessage, parseUpbitMessage } from './upbit'

const RECEIVED_AT = 1_700_000_000_000

describe('createUpbitSubscriptionMessage', () => {
  it('ticker 구독 요청을 만들고 마켓 코드를 대문자로 바꾼다', () => {
    const message = JSON.parse(createUpbitSubscriptionMessage(['krw-btc', 'KRW-ETH'], 'ticket-1')) as unknown
    expect(message).toEqual([
      { ticket: 'ticket-1' },
      { type: 'ticker', codes: ['KRW-BTC', 'KRW-ETH'] },
      { format: 'DEFAULT' },
    ])
  })
})

describe('parseUpbitMessage', () => {
  const tickerMessage = {
    type: 'ticker',
    code: 'KRW-BTC',
    trade_price: 145_000_000,
    trade_timestamp: 1_700_000_000_123,
    timestamp: 1_700_000_000_456,
    stream_type: 'REALTIME',
  }

  it('텍스트 ticker 메시지에서 체결 가격과 체결 시각을 꺼낸다', () => {
    expect(parseUpbitMessage(JSON.stringify(tickerMessage), RECEIVED_AT)).toEqual({
      kind: 'priceTick',
      priceTick: { exchange: 'upbit', symbol: 'KRW-BTC', price: 145_000_000, tradedAt: 1_700_000_000_123 },
    })
  })

  it('바이너리(ArrayBuffer) 메시지도 해석한다', () => {
    const binaryMessage = new TextEncoder().encode(JSON.stringify(tickerMessage)).buffer
    expect(parseUpbitMessage(binaryMessage, RECEIVED_AT).kind).toBe('priceTick')
  })

  it('체결 시각이 없으면 메시지 시각, 그것도 없으면 수신 시각을 쓴다', () => {
    const withoutTradeTimestamp = { ...tickerMessage, trade_timestamp: undefined }
    const withoutAnyTimestamp = { ...withoutTradeTimestamp, timestamp: undefined }
    expect(parseUpbitMessage(JSON.stringify(withoutTradeTimestamp), RECEIVED_AT)).toMatchObject({
      priceTick: { tradedAt: 1_700_000_000_456 },
    })
    expect(parseUpbitMessage(JSON.stringify(withoutAnyTimestamp), RECEIVED_AT)).toMatchObject({
      priceTick: { tradedAt: RECEIVED_AT },
    })
  })

  it('PING 응답, 잘못된 JSON, 가격이 없는 메시지는 무시한다', () => {
    expect(parseUpbitMessage('{"status":"UP"}', RECEIVED_AT)).toEqual({ kind: 'ignored' })
    expect(parseUpbitMessage('not json', RECEIVED_AT)).toEqual({ kind: 'ignored' })
    expect(parseUpbitMessage(JSON.stringify({ ...tickerMessage, trade_price: 0 }), RECEIVED_AT)).toEqual({
      kind: 'ignored',
    })
  })

  it('오류 응답을 알아본다', () => {
    const errorMessage = JSON.stringify({ error: { name: 'TOO_MANY_REQUEST', message: 'too many requests' } })
    expect(parseUpbitMessage(errorMessage, RECEIVED_AT)).toEqual({
      kind: 'error',
      errorMessage: 'TOO_MANY_REQUEST: too many requests',
    })
  })
})
