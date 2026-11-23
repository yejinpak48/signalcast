import { describe, expect, it } from 'vitest'
import { calculateReconnectDelayMs, type ReconnectDelayOptions } from './reconnectDelay'

const options: ReconnectDelayOptions = {
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  jitterRatio: 0.25,
  minimumDelayMs: 0,
}
/** 지터가 0이 되는 난수 (1 - 0.25 + 0.5 × 0.5 = 1) */
const NO_JITTER = 0.5

describe('calculateReconnectDelayMs', () => {
  it('실패할 때마다 대기 시간이 두 배로 늘어난다', () => {
    expect(calculateReconnectDelayMs(1, options, NO_JITTER)).toBe(1_000)
    expect(calculateReconnectDelayMs(2, options, NO_JITTER)).toBe(2_000)
    expect(calculateReconnectDelayMs(3, options, NO_JITTER)).toBe(4_000)
  })

  it('상한을 넘지 않는다', () => {
    expect(calculateReconnectDelayMs(10, options, NO_JITTER)).toBe(30_000)
    expect(calculateReconnectDelayMs(10_000, options, NO_JITTER)).toBe(30_000)
  })

  it('지터는 ±25% 안에 있다', () => {
    expect(calculateReconnectDelayMs(1, options, 0)).toBe(750)
    expect(calculateReconnectDelayMs(1, options, 0.999_999)).toBe(1_250)
  })

  it('지터를 적용해도 최소 대기 시간보다 짧아지지 않는다', () => {
    const upbitLikeOptions = { ...options, baseDelayMs: 10_000, minimumDelayMs: 10_000 }
    expect(calculateReconnectDelayMs(1, upbitLikeOptions, 0)).toBe(10_000)
  })
})
