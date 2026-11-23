import { isPositiveFiniteNumber } from '../../shared/exchanges/messageParsing'
import { createMarketKey, type MarketSnapshot } from '../../shared/market/marketStore'
import { UPBIT_USDT_MARKET, type TrackedAsset } from './trackedAssets'

type MaybeNumber = number | null | undefined

/**
 * 김치 프리미엄(%) = (국내 원화 가격 ÷ (해외 USDT 가격 × 원/달러 환율) − 1) × 100
 * 1 USDT ≈ 1 USD로 본다.
 * - 기본 김프: 원/달러 환율로 ECB 기준환율을 쓴다.
 * - 테더 김프: 원/달러 환율 대신 업비트 USDT 원화 가격을 쓴다.
 *   USDT 가격에도 김프가 섞여 있어 기본 김프보다 작게(0%에 가깝게) 나오므로 따로 보여준다.
 * 값이 하나라도 없거나 0 이하이면 null을 돌려준다.
 */
export function calculateKimchiPremiumPercent(
  domesticPriceInKrw: MaybeNumber,
  foreignPriceInUsdt: MaybeNumber,
  krwPerUsd: MaybeNumber,
): number | null {
  if (
    !isPositiveFiniteNumber(domesticPriceInKrw) ||
    !isPositiveFiniteNumber(foreignPriceInUsdt) ||
    !isPositiveFiniteNumber(krwPerUsd)
  ) {
    return null
  }
  return (domesticPriceInKrw / (foreignPriceInUsdt * krwPerUsd) - 1) * 100
}

/** 해외 USDT 가격을 원화로 환산한다. */
export function convertUsdtToKrw(priceInUsdt: MaybeNumber, krwPerUsd: MaybeNumber): number | null {
  if (!isPositiveFiniteNumber(priceInUsdt) || !isPositiveFiniteNumber(krwPerUsd)) return null
  return priceInUsdt * krwPerUsd
}

/** 업비트 USDT 원화 가격이 공식 환율보다 몇 % 높은지 (USDT 자체의 프리미엄) */
export function calculateUsdtPremiumPercent(upbitUsdtPriceInKrw: MaybeNumber, usdToKrwRate: MaybeNumber): number | null {
  if (!isPositiveFiniteNumber(upbitUsdtPriceInKrw) || !isPositiveFiniteNumber(usdToKrwRate)) return null
  return (upbitUsdtPriceInKrw / usdToKrwRate - 1) * 100
}

export interface AssetPremium {
  assetId: string
  domesticPriceInKrw: number | null
  foreignPriceInUsdt: number | null
  /** 해외 가격을 공식 환율로 원화 환산한 값 */
  foreignPriceInKrw: number | null
  /** 공식 환율(ECB) 기준 김프 */
  kimchiPremiumPercent: number | null
  /** 업비트 USDT 가격 기준 김프 */
  tetherPremiumPercent: number | null
  domesticReceivedAt: number | null
  foreignReceivedAt: number | null
}

/** 시세 스냅샷과 공식 환율로 코인 하나의 김프를 계산한다. */
export function calculateAssetPremium(
  snapshot: MarketSnapshot,
  asset: TrackedAsset,
  usdToKrwRate: number | null,
): AssetPremium {
  const domesticQuote = snapshot.quotesByMarketKey[createMarketKey(asset.domesticMarket)]
  const foreignQuote = snapshot.quotesByMarketKey[createMarketKey(asset.foreignMarket)]
  const upbitUsdtQuote = snapshot.quotesByMarketKey[createMarketKey(UPBIT_USDT_MARKET)]

  const domesticPriceInKrw = domesticQuote?.price ?? null
  const foreignPriceInUsdt = foreignQuote?.price ?? null

  return {
    assetId: asset.id,
    domesticPriceInKrw,
    foreignPriceInUsdt,
    foreignPriceInKrw: convertUsdtToKrw(foreignPriceInUsdt, usdToKrwRate),
    kimchiPremiumPercent: calculateKimchiPremiumPercent(domesticPriceInKrw, foreignPriceInUsdt, usdToKrwRate),
    tetherPremiumPercent: calculateKimchiPremiumPercent(
      domesticPriceInKrw,
      foreignPriceInUsdt,
      upbitUsdtQuote?.price,
    ),
    domesticReceivedAt: domesticQuote?.receivedAt ?? null,
    foreignReceivedAt: foreignQuote?.receivedAt ?? null,
  }
}
