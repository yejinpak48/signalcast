import { useEffect, useState } from 'react'
import {
  EXCHANGE_RATE_REFRESH_INTERVAL_MS,
  fetchEcbUsdToKrwRate,
  readCachedUsdToKrwRate,
  shouldRefreshExchangeRate,
  writeCachedUsdToKrwRate,
  type UsdToKrwRate,
} from './ecbUsdToKrwRate'

export interface UsdToKrwRateState {
  usdToKrwRate: UsdToKrwRate | null
  isLoading: boolean
  /** 마지막 요청이 실패했을 때의 이유. 실패해도 이전 값은 유지한다. */
  errorMessage: string | null
}

function getBrowserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * ECB 기준 USD/KRW 환율.
 * 저장해 둔 값이 있으면 바로 보여주고, 1시간이 지났을 때만 다시 요청한다.
 */
export function useUsdToKrwRate(): UsdToKrwRateState {
  const [state, setState] = useState<UsdToKrwRateState>(() => {
    const cachedRate = readCachedUsdToKrwRate(getBrowserStorage())
    return { usdToKrwRate: cachedRate, isLoading: cachedRate === null, errorMessage: null }
  })

  useEffect(() => {
    const storage = getBrowserStorage()
    const abortController = new AbortController()

    const loadRate = async () => {
      const cachedRate = readCachedUsdToKrwRate(storage)
      if (cachedRate !== null && !shouldRefreshExchangeRate(cachedRate, Date.now())) return
      try {
        const usdToKrwRate = await fetchEcbUsdToKrwRate({ signal: abortController.signal })
        writeCachedUsdToKrwRate(storage, usdToKrwRate)
        setState({ usdToKrwRate, isLoading: false, errorMessage: null })
      } catch (error) {
        if (abortController.signal.aborted) return
        const errorMessage = error instanceof Error ? error.message : String(error)
        setState((previousState) => ({ ...previousState, isLoading: false, errorMessage }))
      }
    }

    void loadRate()
    const intervalId = setInterval(() => void loadRate(), EXCHANGE_RATE_REFRESH_INTERVAL_MS)
    return () => {
      abortController.abort()
      clearInterval(intervalId)
    }
  }, [])

  return state
}
