import type { MarketReference } from '../../shared/market/marketStore'
import { removeDuplicateMarkets } from '../../shared/market/marketStore'

export interface TrackedAsset {
  /** 코인 기호 (예: BTC) */
  id: string
  displayName: string
  /** 원화 마켓 (업비트) */
  domesticMarket: MarketReference
  /** USDT 마켓 (바이낸스) */
  foreignMarket: MarketReference
}

function createTrackedAsset(id: string, displayName: string): TrackedAsset {
  return {
    id,
    displayName,
    domesticMarket: { exchange: 'upbit', symbol: `KRW-${id}` },
    foreignMarket: { exchange: 'binance', symbol: `${id}USDT` },
  }
}

/**
 * 김프를 보여줄 코인 목록. 한 줄을 더하면 실시간 구독, 계산, 화면이 함께 붙는다.
 * 업비트 원화 마켓과 바이낸스 USDT 마켓이 모두 있는 코인만 넣는다.
 */
export const TRACKED_ASSETS: readonly TrackedAsset[] = [
  createTrackedAsset('BTC', '비트코인'),
  createTrackedAsset('ETH', '이더리움'),
  createTrackedAsset('XRP', '엑스알피'),
  createTrackedAsset('SOL', '솔라나'),
  createTrackedAsset('DOGE', '도지코인'),
]

/** 테더 김프 계산에 쓰는 업비트 USDT 원화 마켓 */
export const UPBIT_USDT_MARKET: MarketReference = { exchange: 'upbit', symbol: 'KRW-USDT' }

/** 구독해야 할 모든 마켓 (중복 제거) */
export function listRequiredMarkets(assets: readonly TrackedAsset[]): MarketReference[] {
  return removeDuplicateMarkets([
    UPBIT_USDT_MARKET,
    ...assets.flatMap((asset) => [asset.domesticMarket, asset.foreignMarket]),
  ])
}
