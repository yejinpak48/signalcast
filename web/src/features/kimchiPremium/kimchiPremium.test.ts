import { describe, expect, it } from 'vitest'
import type { MarketSnapshot, PriceQuote } from '../../shared/market/marketStore'
import {
  calculateAssetPremium,
  calculateKimchiPremiumPercent,
  calculateUsdtPremiumPercent,
  convertUsdtToKrw,
} from './kimchiPremium'
import { listRequiredMarkets, TRACKED_ASSETS, type TrackedAsset } from './trackedAssets'

describe('calculateKimchiPremiumPercent', () => {
  it('국내 가격이 해외 원화 환산 가격보다 3% 높으면 +3%', () => {
    // 해외 100,000 USDT × 1,400원 = 1억 4천만 원, 국내 1억 4,420만 원
    expect(calculateKimchiPremiumPercent(144_200_000, 100_000, 1_400)).toBeCloseTo(3, 10)
  })

  it('국내 가격이 더 낮으면 음수 (역프리미엄)', () => {
    expect(calculateKimchiPremiumPercent(138_600_000, 100_000, 1_400)).toBeCloseTo(-1, 10)
  })

  it('값이 없거나 0 이하이거나 숫자가 아니면 null', () => {
    expect(calculateKimchiPremiumPercent(null, 100_000, 1_400)).toBeNull()
    expect(calculateKimchiPremiumPercent(144_200_000, undefined, 1_400)).toBeNull()
    expect(calculateKimchiPremiumPercent(144_200_000, 100_000, 0)).toBeNull()
    expect(calculateKimchiPremiumPercent(144_200_000, -1, 1_400)).toBeNull()
    expect(calculateKimchiPremiumPercent(Number.NaN, 100_000, 1_400)).toBeNull()
  })
})

describe('convertUsdtToKrw / calculateUsdtPremiumPercent', () => {
  it('USDT 가격을 원화로 환산한다', () => {
    expect(convertUsdtToKrw(2.5, 1_400)).toBe(3_500)
    expect(convertUsdtToKrw(2.5, null)).toBeNull()
  })

  it('업비트 USDT가 공식 환율보다 2% 비싸면 +2%', () => {
    expect(calculateUsdtPremiumPercent(1_428, 1_400)).toBeCloseTo(2, 10)
    expect(calculateUsdtPremiumPercent(null, 1_400)).toBeNull()
  })
})

describe('calculateAssetPremium', () => {
  const bitcoin = TRACKED_ASSETS.find((asset) => asset.id === 'BTC') as TrackedAsset

  function createQuote(exchange: 'upbit' | 'binance', symbol: string, price: number): PriceQuote {
    return { exchange, symbol, price, tradedAt: 1_000, receivedAt: 2_000 }
  }

  const snapshot: MarketSnapshot = {
    quotesByMarketKey: {
      'upbit:KRW-BTC': createQuote('upbit', 'KRW-BTC', 144_200_000),
      'binance:BTCUSDT': createQuote('binance', 'BTCUSDT', 100_000),
      'upbit:KRW-USDT': createQuote('upbit', 'KRW-USDT', 1_428),
    },
    statusByExchange: {},
  }

  it('공식 환율 김프와 테더 김프를 따로 계산한다', () => {
    const assetPremium = calculateAssetPremium(snapshot, bitcoin, 1_400)
    expect(assetPremium.kimchiPremiumPercent).toBeCloseTo(3, 10)
    // 144,200,000 ÷ (100,000 × 1,428) − 1 ≈ 0.98%
    expect(assetPremium.tetherPremiumPercent).toBeCloseTo((144_200_000 / 142_800_000 - 1) * 100, 10)
    expect(assetPremium.foreignPriceInKrw).toBe(140_000_000)
    expect(assetPremium.domesticReceivedAt).toBe(2_000)
  })

  it('공식 환율이 아직 없으면 기본 김프는 null이지만 테더 김프는 계산한다', () => {
    const assetPremium = calculateAssetPremium(snapshot, bitcoin, null)
    expect(assetPremium.kimchiPremiumPercent).toBeNull()
    expect(assetPremium.foreignPriceInKrw).toBeNull()
    expect(assetPremium.tetherPremiumPercent).not.toBeNull()
  })

  it('아직 시세를 받지 못한 코인은 모든 값이 null', () => {
    const ethereum = TRACKED_ASSETS.find((asset) => asset.id === 'ETH') as TrackedAsset
    const assetPremium = calculateAssetPremium(snapshot, ethereum, 1_400)
    expect(assetPremium).toMatchObject({
      domesticPriceInKrw: null,
      foreignPriceInUsdt: null,
      kimchiPremiumPercent: null,
      tetherPremiumPercent: null,
    })
  })
})

describe('TRACKED_ASSETS', () => {
  it('BTC, ETH, XRP, SOL, DOGE를 업비트 원화 마켓과 바이낸스 USDT 마켓으로 연결한다', () => {
    expect(TRACKED_ASSETS.map((asset) => asset.id)).toEqual(['BTC', 'ETH', 'XRP', 'SOL', 'DOGE'])
    expect(TRACKED_ASSETS[3]).toMatchObject({
      domesticMarket: { exchange: 'upbit', symbol: 'KRW-SOL' },
      foreignMarket: { exchange: 'binance', symbol: 'SOLUSDT' },
    })
  })

  it('구독 마켓은 코인 5개 × 2 + 업비트 USDT = 11개', () => {
    expect(listRequiredMarkets(TRACKED_ASSETS)).toHaveLength(11)
  })
})
