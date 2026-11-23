import { describe, expect, it, vi } from 'vitest'
import {
  ECB_USD_TO_KRW_URL,
  fetchEcbUsdToKrwRate,
  getExchangeRateFreshness,
  parseEcbUsdToKrwResponse,
  readCachedUsdToKrwRate,
  shouldRefreshExchangeRate,
  writeCachedUsdToKrwRate,
} from './ecbUsdToKrwRate'

const FETCHED_AT = Date.parse('2026-11-23T03:00:00Z')

describe('ECB_USD_TO_KRW_URL', () => {
  it('Frankfurter의 여러 기관 혼합 값이 아니라 ECB 제공처 경로를 쓴다', () => {
    expect(new URL(ECB_USD_TO_KRW_URL).pathname).toBe('/v2/providers/ecb/rates')
  })
})

describe('parseEcbUsdToKrwResponse', () => {
  it('USD/KRW 환율과 기준일을 꺼낸다', () => {
    const response = [{ date: '2026-11-20', base: 'USD', quote: 'KRW', rate: 1339.44 }]
    expect(parseEcbUsdToKrwResponse(response, FETCHED_AT)).toEqual({
      rate: 1339.44,
      referenceDate: '2026-11-20',
      fetchedAt: FETCHED_AT,
    })
  })

  it('여러 항목이 오면 기준일이 가장 최근인 값을 쓴다', () => {
    const response = [
      { date: '2026-11-19', base: 'USD', quote: 'KRW', rate: 1330 },
      { date: '2026-11-20', base: 'USD', quote: 'KRW', rate: 1339.44 },
      { date: '2026-11-18', base: 'USD', quote: 'KRW', rate: 1320 },
    ]
    expect(parseEcbUsdToKrwResponse(response, FETCHED_AT)?.referenceDate).toBe('2026-11-20')
  })

  it('다른 통화, 잘못된 값, 오류 응답은 무시한다', () => {
    expect(parseEcbUsdToKrwResponse([{ date: '2026-11-20', base: 'USD', quote: 'JPY', rate: 150 }], FETCHED_AT)).toBeNull()
    expect(parseEcbUsdToKrwResponse([{ date: '2026-11-20', base: 'USD', quote: 'KRW', rate: 0 }], FETCHED_AT)).toBeNull()
    expect(parseEcbUsdToKrwResponse([{ date: 'yesterday', base: 'USD', quote: 'KRW', rate: 1300 }], FETCHED_AT)).toBeNull()
    expect(parseEcbUsdToKrwResponse({ status: 422, message: 'unknown parameter' }, FETCHED_AT)).toBeNull()
  })
})

describe('fetchEcbUsdToKrwRate', () => {
  it('응답을 해석해 돌려준다', async () => {
    const fetchFunction = vi.fn<typeof fetch>(async () =>
      Response.json([{ date: '2026-11-20', base: 'USD', quote: 'KRW', rate: 1339.44 }]),
    )
    const usdToKrwRate = await fetchEcbUsdToKrwRate({ fetchFunction, getCurrentTime: () => FETCHED_AT })
    expect(usdToKrwRate.rate).toBe(1339.44)
    expect(fetchFunction).toHaveBeenCalledWith(ECB_USD_TO_KRW_URL, expect.anything())
  })

  it('HTTP 오류와 형식 오류는 이유를 담아 실패한다', async () => {
    await expect(
      fetchEcbUsdToKrwRate({ fetchFunction: async () => new Response('', { status: 503 }) }),
    ).rejects.toThrow('HTTP 503')
    await expect(fetchEcbUsdToKrwRate({ fetchFunction: async () => Response.json({}) })).rejects.toThrow(
      '형식',
    )
  })
})

describe('getExchangeRateFreshness', () => {
  const at = (koreaDateTime: string) => Date.parse(`${koreaDateTime}+09:00`)

  it('한국 날짜로 오늘이면 today', () => {
    expect(getExchangeRateFreshness('2026-11-20', at('2026-11-20T23:00:00'))).toBe('today')
  })

  it('주말에는 금요일 값을 직전 영업일 값으로 본다', () => {
    expect(getExchangeRateFreshness('2026-11-20', at('2026-11-22T12:00:00'))).toBe('previousBusinessDay')
    expect(getExchangeRateFreshness('2026-11-20', at('2026-11-23T09:00:00'))).toBe('previousBusinessDay')
  })

  it('5일보다 오래되면 outdated', () => {
    expect(getExchangeRateFreshness('2026-11-20', at('2026-11-25T12:00:00'))).toBe('previousBusinessDay')
    expect(getExchangeRateFreshness('2026-11-20', at('2026-11-26T12:00:00'))).toBe('outdated')
  })
})

describe('shouldRefreshExchangeRate', () => {
  it('받은 지 1시간이 지나야 다시 요청한다', () => {
    const usdToKrwRate = { rate: 1339.44, referenceDate: '2026-11-20', fetchedAt: FETCHED_AT }
    expect(shouldRefreshExchangeRate(usdToKrwRate, FETCHED_AT + 59 * 60_000)).toBe(false)
    expect(shouldRefreshExchangeRate(usdToKrwRate, FETCHED_AT + 60 * 60_000)).toBe(true)
  })
})

describe('환율 캐시', () => {
  function createMemoryStorage() {
    const values = new Map<string, string>()
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    }
  }

  it('저장한 값을 다시 읽는다', () => {
    const storage = createMemoryStorage()
    const usdToKrwRate = { rate: 1339.44, referenceDate: '2026-11-20', fetchedAt: FETCHED_AT }
    writeCachedUsdToKrwRate(storage, usdToKrwRate)
    expect(readCachedUsdToKrwRate(storage)).toEqual(usdToKrwRate)
  })

  it('저장소가 없거나 값이 깨져 있으면 null', () => {
    expect(readCachedUsdToKrwRate(null)).toBeNull()
    const storage = createMemoryStorage()
    storage.setItem('signalcast.ecbUsdToKrwRate.v1', '{not json')
    expect(readCachedUsdToKrwRate(storage)).toBeNull()
  })

  it('저장소가 예외를 던져도 앱이 멈추지 않는다', () => {
    const brokenStorage = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(readCachedUsdToKrwRate(brokenStorage)).toBeNull()
    expect(() =>
      writeCachedUsdToKrwRate(brokenStorage, { rate: 1, referenceDate: '2026-11-20', fetchedAt: FETCHED_AT }),
    ).not.toThrow()
  })
})
