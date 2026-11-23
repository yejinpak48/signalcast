import {
  getExchangeRateFreshness,
  type ExchangeRateFreshness,
} from '../../../shared/exchangeRate/ecbUsdToKrwRate'
import type { UsdToKrwRateState } from '../../../shared/exchangeRate/useUsdToKrwRate'
import {
  formatExchangeRate,
  formatKrw,
  formatPercent,
  getNumberTone,
} from '../../../shared/format/numberFormat'
import type { AssetPremium } from '../kimchiPremium'
import type { QuoteFreshness } from '../quoteFreshness'
import type { TrackedAsset } from '../trackedAssets'

const EXCHANGE_RATE_NOTES: Record<ExchangeRateFreshness, string | null> = {
  today: null,
  previousBusinessDay: 'ECB는 영업일에만 발표하므로 주말·휴일이나 발표 전에는 직전 발표값을 씁니다.',
  outdated: '기준환율이 예상보다 오래되었습니다. 김프 값이 실제와 다를 수 있습니다.',
}

interface PremiumSummaryProps {
  asset: TrackedAsset
  assetPremium: AssetPremium
  freshness: QuoteFreshness
  usdToKrwRateState: UsdToKrwRateState
  upbitUsdtPriceInKrw: number | null
  now: number
}

/** 선택한 코인의 김프 요약. 공식 환율 김프와 테더 김프를 나란히 보여준다. */
export function PremiumSummary({
  asset,
  assetPremium,
  freshness,
  usdToKrwRateState,
  upbitUsdtPriceInKrw,
  now,
}: PremiumSummaryProps) {
  const { usdToKrwRate, isLoading, errorMessage } = usdToKrwRateState
  const exchangeRateNote =
    usdToKrwRate === null ? null : EXCHANGE_RATE_NOTES[getExchangeRateFreshness(usdToKrwRate.referenceDate, now)]
  const priceGapInKrw =
    assetPremium.domesticPriceInKrw !== null && assetPremium.foreignPriceInKrw !== null
      ? assetPremium.domesticPriceInKrw - assetPremium.foreignPriceInKrw
      : null

  return (
    <section className="card premium-summary" aria-labelledby="premium-summary-title">
      <header className="premium-summary-header">
        <h2 id="premium-summary-title">
          {asset.displayName} <span className="muted">{asset.id}</span>
        </h2>
        {freshness === 'delayed' && <span className="badge badge-warning">지연</span>}
      </header>

      <div className="premium-figures">
        <div className="premium-figure">
          <p className="premium-figure-label">김치 프리미엄</p>
          <p className={`premium-figure-value tone-${getNumberTone(assetPremium.kimchiPremiumPercent)}`} aria-live="polite">
            {formatPercent(assetPremium.kimchiPremiumPercent)}
          </p>
          <p className="premium-figure-caption">공식 환율(ECB) 기준</p>
        </div>
        <div className="premium-figure premium-figure-secondary">
          <p className="premium-figure-label">테더 김프</p>
          <p className={`premium-figure-value tone-${getNumberTone(assetPremium.tetherPremiumPercent)}`}>
            {formatPercent(assetPremium.tetherPremiumPercent)}
          </p>
          <p className="premium-figure-caption">업비트 USDT 가격 기준</p>
        </div>
      </div>

      <dl className="premium-details">
        <div>
          <dt>국내 − 해외 가격 차</dt>
          <dd className={`tone-${getNumberTone(priceGapInKrw)}`}>
            {priceGapInKrw === null ? formatKrw(null) : `${priceGapInKrw >= 0 ? '+' : '−'}${formatKrw(Math.abs(priceGapInKrw))}`}
          </dd>
        </div>
        <div>
          <dt>적용 환율 (USD/KRW)</dt>
          <dd>
            {usdToKrwRate === null ? (isLoading ? '불러오는 중' : formatExchangeRate(null)) : `₩${formatExchangeRate(usdToKrwRate.rate)}`}
            {usdToKrwRate !== null && <span className="muted"> · ECB 기준일 {usdToKrwRate.referenceDate}</span>}
          </dd>
        </div>
        <div>
          <dt>업비트 USDT</dt>
          <dd>{formatKrw(upbitUsdtPriceInKrw)}</dd>
        </div>
      </dl>

      {exchangeRateNote !== null && <p className="notice">{exchangeRateNote}</p>}
      {usdToKrwRate === null && errorMessage !== null && (
        <p className="notice notice-warning">
          공식 환율을 불러오지 못해 김치 프리미엄을 계산할 수 없습니다. 테더 김프는 계속 표시되며, 환율은 자동으로 다시
          요청합니다. ({errorMessage})
        </p>
      )}
      <p className="premium-help">
        김치 프리미엄 = 국내 원화 가격 ÷ (해외 USDT 가격 × 원/달러 환율) − 1. 1 USDT ≈ 1 USD로 계산합니다. 테더 김프는
        USDT 가격에 이미 프리미엄이 섞여 있어 0%에 가깝게 나올 수 있습니다.
      </p>
    </section>
  )
}
