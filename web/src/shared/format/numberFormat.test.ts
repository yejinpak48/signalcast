import { describe, expect, it } from 'vitest'
import { formatExchangeRate, formatKrw, formatPercent, formatUsdt, getNumberTone } from './numberFormat'

describe('formatPercent', () => {
  it('부호를 붙이고 소수 둘째 자리까지 보여준다', () => {
    expect(formatPercent(1.7834)).toBe('+1.78%')
    expect(formatPercent(-0.1234)).toBe('−0.12%')
  })

  it('반올림하면 0인 작은 음수는 -0.00%가 아니라 0.00%로 보여준다', () => {
    expect(formatPercent(-0.001)).toBe('0.00%')
    expect(formatPercent(0.004)).toBe('0.00%')
    expect(formatPercent(0)).toBe('0.00%')
  })

  it('값이 없으면 —', () => {
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(Number.NaN)).toBe('—')
  })
})

describe('getNumberTone', () => {
  it('양수·음수·0에 가까운 값을 구분한다', () => {
    expect(getNumberTone(1.78)).toBe('positive')
    expect(getNumberTone(-0.12)).toBe('negative')
    expect(getNumberTone(-0.001)).toBe('neutral')
    expect(getNumberTone(null)).toBe('neutral')
  })
})

describe('가격 형식', () => {
  it('원화는 큰 값은 정수, 작은 값은 소수까지 보여준다', () => {
    expect(formatKrw(83_646_000)).toBe('₩83,646,000')
    expect(formatKrw(75.5)).toBe('₩75.5')
    expect(formatKrw(null)).toBe('—')
  })

  it('USDT는 가격 크기에 맞춰 자릿수를 고른다', () => {
    expect(formatUsdt(61_358.02)).toBe('61,358.02 USDT')
    expect(formatUsdt(61_358)).toBe('61,358.00 USDT')
    expect(formatUsdt(0.9387)).toBe('0.9387 USDT')
    expect(formatUsdt(0.05546)).toBe('0.05546 USDT')
  })

  it('환율은 소수 둘째 자리까지 고정', () => {
    expect(formatExchangeRate(1339.4)).toBe('1,339.40')
  })
})
