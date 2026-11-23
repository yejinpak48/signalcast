import type { ConnectionStatus, ExchangeId } from '../exchanges/types'

/** 연속 실패가 이 횟수를 넘으면 원인 안내를 보여준다. */
const NOTICE_AFTER_FAILED_ATTEMPTS = 3

const STATE_LABELS: Record<ConnectionStatus['state'], string> = {
  connecting: '연결 중',
  open: '연결됨',
  reconnecting: '재연결 대기',
  closed: '연결 끊김',
}

interface ConnectionStatusBarProps {
  exchanges: ReadonlyArray<{ id: ExchangeId; displayName: string }>
  statusByExchange: Readonly<Partial<Record<ExchangeId, ConnectionStatus>>>
  now: number
}

function describeStatus(status: ConnectionStatus | undefined, now: number): string {
  if (status === undefined) return STATE_LABELS.connecting
  if (status.state === 'reconnecting' && status.nextRetryAt !== null) {
    const secondsUntilRetry = Math.max(0, Math.ceil((status.nextRetryAt - now) / 1_000))
    return `${STATE_LABELS.reconnecting} · ${secondsUntilRetry}초 후`
  }
  return STATE_LABELS[status.state]
}

/** 거래소별 실시간 연결 상태 */
export function ConnectionStatusBar({ exchanges, statusByExchange, now }: ConnectionStatusBarProps) {
  const failingExchanges = exchanges.filter(
    (exchange) => (statusByExchange[exchange.id]?.failedAttemptCount ?? 0) >= NOTICE_AFTER_FAILED_ATTEMPTS,
  )

  return (
    <section className="connection-status" aria-label="거래소 연결 상태">
      <ul className="connection-status-list" role="status" aria-live="polite">
        {exchanges.map((exchange) => {
          const status = statusByExchange[exchange.id]
          return (
            <li
              key={exchange.id}
              className={`connection-chip connection-${status?.state ?? 'connecting'}`}
              title={status?.reason ?? undefined}
            >
              <span className="connection-dot" aria-hidden="true" />
              <span className="connection-name">{exchange.displayName}</span>
              <span className="connection-label">{describeStatus(status, now)}</span>
            </li>
          )
        })}
      </ul>
      {failingExchanges.map((exchange) => (
        <p key={exchange.id} className="notice notice-warning">
          {exchange.displayName}에 연결하지 못하고 있습니다. 네트워크 환경이나 접속 지역에 따라 연결이 제한될 수
          있으며, 자동으로 계속 다시 시도합니다.
        </p>
      ))}
    </section>
  )
}
