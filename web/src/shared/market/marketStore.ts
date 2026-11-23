import type { ConnectionStatus, ExchangeId, ExchangePriceSource, PriceTick } from '../exchanges/types'

/** 거래소의 마켓 하나 (예: 업비트 KRW-BTC) */
export interface MarketReference {
  exchange: ExchangeId
  symbol: string
}

/** 마지막으로 받은 가격과, 브라우저가 그 메시지를 받은 시각 */
export interface PriceQuote extends PriceTick {
  receivedAt: number
}

export interface MarketSnapshot {
  quotesByMarketKey: Readonly<Record<string, PriceQuote>>
  statusByExchange: Readonly<Partial<Record<ExchangeId, ConnectionStatus>>>
}

export interface MarketStoreOptions {
  priceSources: Readonly<Record<ExchangeId, ExchangePriceSource>>
  /** 시세는 초당 수십 번 들어오므로 화면 갱신 알림을 이 간격으로 묶는다. */
  notifyIntervalMs: number
  getCurrentTime?: () => number
}

export function createMarketKey(market: MarketReference): string {
  return `${market.exchange}:${market.symbol}`
}

/** 같은 마켓이 여러 번 들어 있어도 한 번만 남긴다. */
export function removeDuplicateMarkets(markets: readonly MarketReference[]): MarketReference[] {
  return [...new Map(markets.map((market) => [createMarketKey(market), market])).values()]
}

/**
 * 여러 거래소 연결을 묶어 최신 가격과 연결 상태를 보관한다.
 * - 거래소별로 WebSocket 하나만 연다.
 * - 가격 변화는 notifyIntervalMs마다 묶어서 알리고, 연결 상태 변화는 바로 알린다.
 * - 여러 화면이 start해도 연결은 하나만 유지한다 (마지막 사용자가 stop하면 끊는다).
 * - 시세는 이 브라우저 안에서만 쓰고 어디에도 다시 보내지 않는다 (약관 규칙).
 * React에서는 useSyncExternalStore로 구독한다.
 */
export class MarketStore {
  private readonly markets: readonly MarketReference[]
  private readonly requestedMarketKeys: ReadonlySet<string>
  private readonly options: MarketStoreOptions
  private readonly getCurrentTime: () => number

  private readonly quotesByMarketKey = new Map<string, PriceQuote>()
  private readonly statusByExchange = new Map<ExchangeId, ConnectionStatus>()
  private readonly listeners = new Set<() => void>()
  private snapshot: MarketSnapshot = { quotesByMarketKey: {}, statusByExchange: {} }
  private notifyTimer: ReturnType<typeof setTimeout> | null = null
  private unsubscribeFunctions: Array<() => void> = []
  private activeUserCount = 0

  constructor(markets: readonly MarketReference[], options: MarketStoreOptions) {
    this.markets = removeDuplicateMarkets(markets)
    this.requestedMarketKeys = new Set(this.markets.map(createMarketKey))
    this.options = options
    this.getCurrentTime = options.getCurrentTime ?? Date.now
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly getSnapshot = (): MarketSnapshot => this.snapshot

  start(): void {
    this.activeUserCount += 1
    if (this.activeUserCount > 1) return

    const symbolsByExchange = new Map<ExchangeId, string[]>()
    for (const market of this.markets) {
      symbolsByExchange.set(market.exchange, [...(symbolsByExchange.get(market.exchange) ?? []), market.symbol])
    }

    for (const [exchangeId, symbols] of symbolsByExchange) {
      const unsubscribe = this.options.priceSources[exchangeId].subscribeToPrices(symbols, {
        onPriceTick: (priceTick) => this.handlePriceTick(priceTick),
        onStatusChange: (status) => {
          this.statusByExchange.set(exchangeId, status)
          this.notifyNow()
        },
      })
      this.unsubscribeFunctions.push(unsubscribe)
    }
  }

  stop(): void {
    if (this.activeUserCount === 0) return
    this.activeUserCount -= 1
    if (this.activeUserCount > 0) return

    for (const unsubscribe of this.unsubscribeFunctions) unsubscribe()
    this.unsubscribeFunctions = []
    if (this.notifyTimer !== null) clearTimeout(this.notifyTimer)
    this.notifyTimer = null
  }

  private handlePriceTick(priceTick: PriceTick): void {
    const marketKey = createMarketKey(priceTick)
    if (!this.requestedMarketKeys.has(marketKey)) return
    this.quotesByMarketKey.set(marketKey, { ...priceTick, receivedAt: this.getCurrentTime() })
    this.scheduleNotify()
  }

  private scheduleNotify(): void {
    if (this.notifyTimer !== null) return
    this.notifyTimer = setTimeout(() => this.notifyNow(), this.options.notifyIntervalMs)
  }

  private notifyNow(): void {
    if (this.notifyTimer !== null) clearTimeout(this.notifyTimer)
    this.notifyTimer = null
    this.snapshot = {
      quotesByMarketKey: Object.fromEntries(this.quotesByMarketKey),
      statusByExchange: Object.fromEntries(this.statusByExchange),
    }
    for (const listener of this.listeners) listener()
  }
}
