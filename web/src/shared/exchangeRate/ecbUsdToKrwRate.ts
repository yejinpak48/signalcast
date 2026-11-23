import { isPositiveFiniteNumber, isRecord } from '../exchanges/messageParsing'

/**
 * ECB(유럽중앙은행) 기준환율로 계산한 USD/KRW를 Frankfurter API의 ECB 제공처 경로에서 받는다.
 * - 브라우저에서 직접 호출한다 (키 없음, CORS 허용). 서버를 거치지 않는다.
 * - ECB는 TARGET 영업일 약 16:00 CET에 하루 한 번 발표하고, 주말·휴일에는 갱신하지 않는다.
 * - ECB는 USD/KRW를 직접 발표하지 않으므로 EUR 기준 두 환율에서 교차 계산된 값이다.
 * - 화면에는 반드시 "환율 출처: ECB"와 기준일을 표시한다 (ECB 재배포 조건).
 */
export const ECB_USD_TO_KRW_URL = 'https://api.frankfurter.dev/v2/providers/ecb/rates?base=USD&quotes=KRW'

/** 출처 표시에 쓰는 정보 */
export const ECB_EXCHANGE_RATE_ATTRIBUTION = {
  sourceName: 'ECB',
  description: '유럽중앙은행 기준환율 (EUR 기준 교차 계산, Frankfurter API 경유)',
  sourceUrl: 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',
} as const

/** 하루 한 번 발표되는 값이라 자주 요청할 필요가 없다. */
export const EXCHANGE_RATE_REFRESH_INTERVAL_MS = 60 * 60_000

const REQUEST_TIMEOUT_MS = 8_000
const CACHE_STORAGE_KEY = 'signalcast.ecbUsdToKrwRate.v1'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
/** 주말과 연휴(예: 부활절 금요일~월요일)를 넘어서도 기준일이 이보다 오래되면 이상한 상황으로 본다. */
const MAXIMUM_EXPECTED_AGE_DAYS = 5
const KOREA_TIME_OFFSET_MS = 9 * 60 * 60_000
const DAY_MS = 24 * 60 * 60_000

export interface UsdToKrwRate {
  /** 1달러당 원화 */
  rate: number
  /** ECB 기준일 (YYYY-MM-DD) */
  referenceDate: string
  /** 브라우저가 이 값을 받아 온 시각 (ms) */
  fetchedAt: number
}

/**
 * Frankfurter 응답을 해석한다. 예: [{"date":"2026-11-20","base":"USD","quote":"KRW","rate":1339.44}]
 * 여러 항목이 오면 기준일이 가장 최근인 값을 쓴다.
 */
export function parseEcbUsdToKrwResponse(json: unknown, fetchedAt: number): UsdToKrwRate | null {
  if (!Array.isArray(json)) return null
  let latestRate: UsdToKrwRate | null = null
  for (const item of json) {
    if (!isRecord(item)) continue
    const { date, base, quote, rate } = item
    if (base !== 'USD' || quote !== 'KRW') continue
    if (typeof date !== 'string' || !DATE_PATTERN.test(date) || !isPositiveFiniteNumber(rate)) continue
    if (latestRate === null || date > latestRate.referenceDate) latestRate = { rate, referenceDate: date, fetchedAt }
  }
  return latestRate
}

export async function fetchEcbUsdToKrwRate(
  options: { signal?: AbortSignal; fetchFunction?: typeof fetch; getCurrentTime?: () => number } = {},
): Promise<UsdToKrwRate> {
  const fetchFunction = options.fetchFunction ?? fetch
  const getCurrentTime = options.getCurrentTime ?? Date.now
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal

  const response = await fetchFunction(ECB_USD_TO_KRW_URL, { signal })
  if (!response.ok) throw new Error(`환율 요청 실패 (HTTP ${response.status})`)
  const json: unknown = await response.json().catch(() => undefined)
  const usdToKrwRate = parseEcbUsdToKrwResponse(json, getCurrentTime())
  if (usdToKrwRate === null) throw new Error('환율 응답 형식이 예상과 다릅니다')
  return usdToKrwRate
}

export type ExchangeRateFreshness =
  /** 오늘 기준일 */
  | 'today'
  /** 주말·휴일이거나 오늘 발표 전이라 직전 영업일 값 */
  | 'previousBusinessDay'
  /** 예상보다 오래된 값 (화면에 경고) */
  | 'outdated'

/** 기준일이 한국 날짜로 오늘에서 며칠 지났는지 보고 신선도를 판단한다. */
export function getExchangeRateFreshness(referenceDate: string, now: number): ExchangeRateFreshness {
  const todayInKorea = new Date(now + KOREA_TIME_OFFSET_MS).toISOString().slice(0, 10)
  const ageDays = Math.round((Date.parse(todayInKorea) - Date.parse(referenceDate)) / DAY_MS)
  if (!Number.isFinite(ageDays) || ageDays > MAXIMUM_EXPECTED_AGE_DAYS) return 'outdated'
  return ageDays <= 0 ? 'today' : 'previousBusinessDay'
}

export function shouldRefreshExchangeRate(usdToKrwRate: UsdToKrwRate, now: number): boolean {
  return now - usdToKrwRate.fetchedAt >= EXCHANGE_RATE_REFRESH_INTERVAL_MS
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

/** 새로고침할 때마다 다시 요청하지 않도록 마지막 값을 브라우저에 보관한다. */
export function readCachedUsdToKrwRate(storage: KeyValueStorage | null): UsdToKrwRate | null {
  if (storage === null) return null
  try {
    const cachedText = storage.getItem(CACHE_STORAGE_KEY)
    if (cachedText === null) return null
    const cached: unknown = JSON.parse(cachedText)
    if (!isRecord(cached)) return null
    const { rate, referenceDate, fetchedAt } = cached
    if (!isPositiveFiniteNumber(rate) || !isPositiveFiniteNumber(fetchedAt)) return null
    if (typeof referenceDate !== 'string' || !DATE_PATTERN.test(referenceDate)) return null
    return { rate, referenceDate, fetchedAt }
  } catch {
    return null
  }
}

export function writeCachedUsdToKrwRate(storage: KeyValueStorage | null, usdToKrwRate: UsdToKrwRate): void {
  if (storage === null) return
  try {
    storage.setItem(CACHE_STORAGE_KEY, JSON.stringify(usdToKrwRate))
  } catch {
    // 저장 공간이 없거나 사파리 프라이빗 모드 — 캐시 없이 동작한다.
  }
}
