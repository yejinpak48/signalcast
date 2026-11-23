export interface ReconnectDelayOptions {
  /** 첫 번째 재연결 대기 시간 */
  baseDelayMs: number
  /** 대기 시간 상한. 지터를 적용한 뒤에도 이 값을 넘지 않는다. */
  maxDelayMs: number
  /** 지터 비율 (0~1). 0.25면 계산한 대기 시간의 ±25% 안에서 흔든다. */
  jitterRatio: number
  /** 지터를 적용한 뒤에도 이보다 짧게 기다리지 않는다 (거래소 연결 요청 제한 대비). */
  minimumDelayMs: number
}

/**
 * 지수 백오프 + 지터로 다음 재연결까지 기다릴 시간을 계산한다.
 * 실패 횟수가 늘수록 대기 시간이 두 배씩 늘고, 상한에서 멈춘다.
 * 지터는 여러 방문자가 한꺼번에 다시 연결해 거래소에 몰리는 것을 막는다.
 * 결과는 항상 minimumDelayMs 이상, maxDelayMs 이하다 (minimumDelayMs가 우선).
 *
 * @param failedAttemptCount 연속으로 실패한 횟수 (1부터 시작)
 * @param randomValue 0 이상 1 미만의 난수 (테스트에서 고정값을 넣는다)
 */
export function calculateReconnectDelayMs(
  failedAttemptCount: number,
  options: ReconnectDelayOptions,
  randomValue: number,
): number {
  const exponent = Math.max(0, failedAttemptCount - 1)
  const exponentialDelayMs = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** exponent)
  const jitterMultiplier = 1 - options.jitterRatio + randomValue * 2 * options.jitterRatio
  const jitteredDelayMs = Math.min(options.maxDelayMs, Math.round(exponentialDelayMs * jitterMultiplier))
  return Math.max(options.minimumDelayMs, jitteredDelayMs)
}
