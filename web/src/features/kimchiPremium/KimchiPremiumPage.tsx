import { exchangePriceSources } from '../../shared/exchanges'
import { useUsdToKrwRate } from '../../shared/exchangeRate/useUsdToKrwRate'
import { useCurrentTime } from '../../shared/hooks/useCurrentTime'
import { useLocalStorageState } from '../../shared/hooks/useLocalStorageState'
import { createMarketKey } from '../../shared/market/marketStore'
import { useMarketSnapshot } from '../../shared/market/useMarketSnapshot'
import { ConnectionStatusBar } from '../../shared/ui/ConnectionStatusBar'
import { PremiumSummary } from './components/PremiumSummary'
import { PremiumTable, type PremiumTableRow } from './components/PremiumTable'
import { calculateAssetPremium } from './kimchiPremium'
import { kimchiPremiumMarketStore } from './kimchiPremiumMarketStore'
import { combineQuoteFreshness, getQuoteFreshness } from './quoteFreshness'
import { TRACKED_ASSETS, UPBIT_USDT_MARKET, type TrackedAsset } from './trackedAssets'

const CONNECTED_EXCHANGES = [exchangePriceSources.upbit, exchangePriceSources.binance]
const DEFAULT_ASSET = TRACKED_ASSETS[0] as TrackedAsset

function isTrackedAssetId(value: unknown): value is string {
  return typeof value === 'string' && TRACKED_ASSETS.some((asset) => asset.id === value)
}

/** 1차 화면: 업비트·바이낸스 실시간 시세로 계산한 김치 프리미엄 */
export function KimchiPremiumPage() {
  const marketSnapshot = useMarketSnapshot(kimchiPremiumMarketStore)
  const usdToKrwRateState = useUsdToKrwRate()
  const now = useCurrentTime()
  const [selectedAssetId, setSelectedAssetId] = useLocalStorageState(
    'signalcast.selectedAssetId',
    DEFAULT_ASSET.id,
    isTrackedAssetId,
  )

  const usdToKrwRate = usdToKrwRateState.usdToKrwRate?.rate ?? null
  const { statusByExchange } = marketSnapshot

  const rows: PremiumTableRow[] = TRACKED_ASSETS.map((asset) => {
    const assetPremium = calculateAssetPremium(marketSnapshot, asset, usdToKrwRate)
    const freshness = combineQuoteFreshness([
      getQuoteFreshness(assetPremium.domesticReceivedAt, statusByExchange[asset.domesticMarket.exchange], now),
      getQuoteFreshness(assetPremium.foreignReceivedAt, statusByExchange[asset.foreignMarket.exchange], now),
    ])
    return { asset, assetPremium, freshness }
  })
  const selectedRow = rows.find((row) => row.asset.id === selectedAssetId) ?? rows[0]
  const upbitUsdtPriceInKrw = marketSnapshot.quotesByMarketKey[createMarketKey(UPBIT_USDT_MARKET)]?.price ?? null

  return (
    <div className="page kimchi-premium-page">
      <ConnectionStatusBar exchanges={CONNECTED_EXCHANGES} statusByExchange={statusByExchange} now={now} />
      {selectedRow !== undefined && (
        <PremiumSummary
          asset={selectedRow.asset}
          assetPremium={selectedRow.assetPremium}
          freshness={selectedRow.freshness}
          usdToKrwRateState={usdToKrwRateState}
          upbitUsdtPriceInKrw={upbitUsdtPriceInKrw}
          now={now}
        />
      )}
      <PremiumTable rows={rows} selectedAssetId={selectedAssetId} onSelectAsset={setSelectedAssetId} />
    </div>
  )
}
