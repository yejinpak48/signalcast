type MaybeNumber = number | null | undefined

/** 값이 없을 때 화면에 보여줄 표시 */
export const EMPTY_VALUE_TEXT = '—'

function isDisplayableNumber(value: MaybeNumber): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 가격 크기에 맞춰 소수 자릿수를 고른다 (예: BTC 8천만 원은 정수, DOGE 75.5원은 소수 1자리). */
function chooseMaximumFractionDigits(value: number, digitsForLargeValues: number): number {
  const absoluteValue = Math.abs(value)
  if (absoluteValue >= 1_000) return digitsForLargeValues
  if (absoluteValue >= 1) return Math.max(digitsForLargeValues, 2)
  return 6
}

function formatNumber(value: number, maximumFractionDigits: number, minimumFractionDigits = 0): string {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits, minimumFractionDigits }).format(value)
}

/** 원화 가격. 예: ₩83,646,000 / ₩75.5 */
export function formatKrw(value: MaybeNumber): string {
  if (!isDisplayableNumber(value)) return EMPTY_VALUE_TEXT
  return `₩${formatNumber(value, chooseMaximumFractionDigits(value, 0))}`
}

/** USDT 가격. 예: 61,358.02 USDT / 0.05546 USDT */
export function formatUsdt(value: MaybeNumber): string {
  if (!isDisplayableNumber(value)) return EMPTY_VALUE_TEXT
  const maximumFractionDigits = chooseMaximumFractionDigits(value, 2)
  const minimumFractionDigits = Math.abs(value) >= 1_000 ? 2 : 0
  return `${formatNumber(value, maximumFractionDigits, minimumFractionDigits)} USDT`
}

/** 환율. 예: 1,339.44 */
export function formatExchangeRate(value: MaybeNumber): string {
  if (!isDisplayableNumber(value)) return EMPTY_VALUE_TEXT
  return formatNumber(value, 2, 2)
}

/**
 * 부호를 붙인 퍼센트. 예: +1.78% / −0.12% / 0.00%
 * 반올림하면 0이 되는 작은 음수는 "-0.00%"가 아니라 "0.00%"로 보여준다.
 */
export function formatPercent(value: MaybeNumber, fractionDigits = 2): string {
  if (!isDisplayableNumber(value)) return EMPTY_VALUE_TEXT
  const roundedText = Math.abs(value).toFixed(fractionDigits)
  if (Number(roundedText) === 0) return `${roundedText}%`
  return `${value > 0 ? '+' : '−'}${roundedText}%`
}

export type NumberTone = 'positive' | 'negative' | 'neutral'

/** 부호에 따른 색 구분. 반올림하면 0인 값은 중립으로 본다. */
export function getNumberTone(value: MaybeNumber, fractionDigits = 2): NumberTone {
  if (!isDisplayableNumber(value) || Number(Math.abs(value).toFixed(fractionDigits)) === 0) return 'neutral'
  return value > 0 ? 'positive' : 'negative'
}

/** 24시간제 시각. 예: 19:27:35 */
export function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}
