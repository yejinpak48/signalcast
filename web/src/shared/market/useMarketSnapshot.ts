import { useEffect, useSyncExternalStore } from 'react'
import type { MarketSnapshot, MarketStore } from './marketStore'

/** 화면이 보이는 동안 거래소 연결을 유지하고, 최신 시세·연결 상태를 구독한다. */
export function useMarketSnapshot(marketStore: MarketStore): MarketSnapshot {
  useEffect(() => {
    marketStore.start()
    return () => marketStore.stop()
  }, [marketStore])
  return useSyncExternalStore(marketStore.subscribe, marketStore.getSnapshot)
}
