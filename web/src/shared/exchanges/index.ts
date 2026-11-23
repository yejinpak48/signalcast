import { binancePriceSource } from './binance'
import type { ExchangeId, ExchangePriceSource } from './types'
import { upbitPriceSource } from './upbit'

/** 거래소별 실시간 시세 연결 */
export const exchangePriceSources: Record<ExchangeId, ExchangePriceSource> = {
  upbit: upbitPriceSource,
  binance: binancePriceSource,
}

export type * from './types'
