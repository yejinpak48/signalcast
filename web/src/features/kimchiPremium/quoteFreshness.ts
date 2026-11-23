import type { ConnectionStatus } from '../../shared/exchanges/types'

/**
 * 시세를 받은 지 이보다 오래되면 "지연"으로 표시한다.
 * 추적하는 코인은 모두 몇 초 안에 체결이 들어오므로, 1분이면 거래가 뜸해서 생기는 오탐이 거의 없다.
 */
export const DELAYED_QUOTE_THRESHOLD_MS = 60_000

export type QuoteFreshness = 'live' | 'delayed' | 'missing'

/** 시세 하나가 지금 믿을 만한지 판단한다. 연결이 끊겼으면 마지막 값이 있어도 "지연"이다. */
export function getQuoteFreshness(
  receivedAt: number | null,
  connectionStatus: ConnectionStatus | undefined,
  now: number,
): QuoteFreshness {
  if (receivedAt === null) return 'missing'
  if (connectionStatus?.state !== 'open') return 'delayed'
  return now - receivedAt > DELAYED_QUOTE_THRESHOLD_MS ? 'delayed' : 'live'
}

/** 여러 시세 중 가장 나쁜 상태 (김프는 국내·해외 가격이 모두 살아 있어야 믿을 수 있다) */
export function combineQuoteFreshness(freshnessList: readonly QuoteFreshness[]): QuoteFreshness {
  if (freshnessList.includes('missing')) return 'missing'
  if (freshnessList.includes('delayed')) return 'delayed'
  return 'live'
}
