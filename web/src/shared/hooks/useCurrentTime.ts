import { useEffect, useState } from 'react'

/** 주기적으로 갱신되는 현재 시각. 렌더 중에 Date.now()를 직접 부르지 않기 위해 쓴다. */
export function useCurrentTime(intervalMs = 1_000): number {
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  useEffect(() => {
    const intervalId = setInterval(() => setCurrentTime(Date.now()), intervalMs)
    return () => clearInterval(intervalId)
  }, [intervalMs])
  return currentTime
}
