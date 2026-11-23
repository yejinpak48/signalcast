import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ConnectionStatus,
  ExchangeId,
  ExchangePriceSource,
  PriceSubscriptionHandlers,
  PriceTick,
} from '../exchanges/types'
import { MarketStore, removeDuplicateMarkets } from './marketStore'

/** 테스트용 가짜 거래소. 구독 요청을 기록하고, 가격과 상태를 직접 흘려보낸다. */
function createFakePriceSource(id: ExchangeId) {
  const subscriptions: Array<{ symbols: readonly string[]; handlers: PriceSubscriptionHandlers }> = []
  let unsubscribeCount = 0
  const priceSource: ExchangePriceSource = {
    id,
    displayName: id,
    subscribeToPrices(symbols, handlers) {
      subscriptions.push({ symbols, handlers })
      return () => {
        unsubscribeCount += 1
      }
    },
  }
  const latestHandlers = () => {
    const handlers = subscriptions.at(-1)?.handlers
    if (!handlers) throw new Error('구독이 없습니다')
    return handlers
  }
  return {
    priceSource,
    subscriptions,
    getUnsubscribeCount: () => unsubscribeCount,
    emitPrice: (symbol: string, price: number) => {
      const priceTick: PriceTick = { exchange: id, symbol, price, tradedAt: 1 }
      latestHandlers().onPriceTick(priceTick)
    },
    emitStatus: (state: ConnectionStatus['state']) =>
      latestHandlers().onStatusChange({
        state,
        failedAttemptCount: 0,
        lastMessageAt: null,
        nextRetryAt: null,
        reason: null,
        endpointUrl: `wss://${id}.example`,
      }),
  }
}

function setUpStore() {
  const upbit = createFakePriceSource('upbit')
  const binance = createFakePriceSource('binance')
  const marketStore = new MarketStore(
    [
      { exchange: 'upbit', symbol: 'KRW-BTC' },
      { exchange: 'upbit', symbol: 'KRW-USDT' },
      { exchange: 'binance', symbol: 'BTCUSDT' },
      { exchange: 'upbit', symbol: 'KRW-BTC' },
    ],
    {
      priceSources: { upbit: upbit.priceSource, binance: binance.priceSource },
      notifyIntervalMs: 250,
      getCurrentTime: () => Date.now(),
    },
  )
  const listener = vi.fn<() => void>()
  marketStore.subscribe(listener)
  return { marketStore, upbit, binance, listener }
}

describe('MarketStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('거래소마다 연결 하나로, 중복 없이 마켓을 구독한다', () => {
    const { marketStore, upbit, binance } = setUpStore()
    marketStore.start()
    expect(upbit.subscriptions).toHaveLength(1)
    expect(upbit.subscriptions[0]?.symbols).toEqual(['KRW-BTC', 'KRW-USDT'])
    expect(binance.subscriptions[0]?.symbols).toEqual(['BTCUSDT'])
    marketStore.stop()
  })

  it('가격 변화는 0.25초 단위로 묶어서 한 번만 알린다', () => {
    const { marketStore, upbit, binance, listener } = setUpStore()
    marketStore.start()
    upbit.emitPrice('KRW-BTC', 100)
    upbit.emitPrice('KRW-BTC', 101)
    binance.emitPrice('BTCUSDT', 70)
    expect(listener).not.toHaveBeenCalled()

    vi.advanceTimersByTime(250)
    expect(listener).toHaveBeenCalledTimes(1)
    const snapshot = marketStore.getSnapshot()
    expect(snapshot.quotesByMarketKey['upbit:KRW-BTC']).toMatchObject({ price: 101, receivedAt: Date.now() - 250 })
    expect(snapshot.quotesByMarketKey['binance:BTCUSDT']?.price).toBe(70)
    marketStore.stop()
  })

  it('연결 상태 변화는 바로 알린다', () => {
    const { marketStore, upbit, listener } = setUpStore()
    marketStore.start()
    upbit.emitStatus('open')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(marketStore.getSnapshot().statusByExchange.upbit?.state).toBe('open')
    marketStore.stop()
  })

  it('요청하지 않은 마켓의 가격은 저장하지 않는다', () => {
    const { marketStore, upbit } = setUpStore()
    marketStore.start()
    upbit.emitPrice('KRW-ETH', 5)
    vi.advanceTimersByTime(250)
    expect(marketStore.getSnapshot().quotesByMarketKey['upbit:KRW-ETH']).toBeUndefined()
    marketStore.stop()
  })

  it('여러 곳에서 start해도 연결은 하나이고, 마지막 stop에서만 끊는다', () => {
    const { marketStore, upbit, binance } = setUpStore()
    marketStore.start()
    marketStore.start()
    expect(upbit.subscriptions).toHaveLength(1)

    marketStore.stop()
    expect(upbit.getUnsubscribeCount()).toBe(0)
    marketStore.stop()
    expect(upbit.getUnsubscribeCount()).toBe(1)
    expect(binance.getUnsubscribeCount()).toBe(1)

    // 짝이 맞지 않는 stop은 무시한다.
    marketStore.stop()
    expect(upbit.getUnsubscribeCount()).toBe(1)
  })

  it('구독을 끝낸 뒤에는 예약된 알림도 보내지 않는다', () => {
    const { marketStore, upbit, listener } = setUpStore()
    marketStore.start()
    upbit.emitPrice('KRW-BTC', 100)
    marketStore.stop()
    vi.advanceTimersByTime(1_000)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('removeDuplicateMarkets', () => {
  it('같은 거래소·심볼은 한 번만 남긴다', () => {
    expect(
      removeDuplicateMarkets([
        { exchange: 'upbit', symbol: 'KRW-BTC' },
        { exchange: 'binance', symbol: 'KRW-BTC' },
        { exchange: 'upbit', symbol: 'KRW-BTC' },
      ]),
    ).toHaveLength(2)
  })
})
