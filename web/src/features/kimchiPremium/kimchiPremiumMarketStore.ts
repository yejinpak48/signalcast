import { exchangePriceSources } from '../../shared/exchanges'
import { MarketStore } from '../../shared/market/marketStore'
import { listRequiredMarkets, TRACKED_ASSETS } from './trackedAssets'

/** 김프 화면이 쓰는 시세 스토어. 화면 갱신은 0.25초마다 묶어서 한다. */
export const kimchiPremiumMarketStore = new MarketStore(listRequiredMarkets(TRACKED_ASSETS), {
  priceSources: exchangePriceSources,
  notifyIntervalMs: 250,
})
