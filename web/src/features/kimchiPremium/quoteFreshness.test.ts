import { describe, expect, it } from 'vitest'
import type { ConnectionStatus } from '../../shared/exchanges/types'
import { combineQuoteFreshness, getQuoteFreshness } from './quoteFreshness'

const NOW = 1_000_000

function createStatus(state: ConnectionStatus['state']): ConnectionStatus {
  return { state, failedAttemptCount: 0, lastMessageAt: null, nextRetryAt: null, reason: null, endpointUrl: 'wss://x' }
}

describe('getQuoteFreshness', () => {
  it('받은 적 없으면 missing', () => {
    expect(getQuoteFreshness(null, createStatus('open'), NOW)).toBe('missing')
  })

  it('연결이 열려 있고 1분 안에 받았으면 live', () => {
    expect(getQuoteFreshness(NOW - 60_000, createStatus('open'), NOW)).toBe('live')
  })

  it('1분이 넘었으면 delayed', () => {
    expect(getQuoteFreshness(NOW - 60_001, createStatus('open'), NOW)).toBe('delayed')
  })

  it('연결이 끊겼거나 재연결 중이면 방금 받은 값이어도 delayed', () => {
    expect(getQuoteFreshness(NOW, createStatus('reconnecting'), NOW)).toBe('delayed')
    expect(getQuoteFreshness(NOW, undefined, NOW)).toBe('delayed')
  })
})

describe('combineQuoteFreshness', () => {
  it('가장 나쁜 상태를 고른다', () => {
    expect(combineQuoteFreshness(['live', 'live'])).toBe('live')
    expect(combineQuoteFreshness(['live', 'delayed'])).toBe('delayed')
    expect(combineQuoteFreshness(['delayed', 'missing'])).toBe('missing')
  })
})
