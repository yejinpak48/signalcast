import { calculateReconnectDelayMs, type ReconnectDelayOptions } from './reconnectDelay'
import type { ConnectionState, ConnectionStatus } from './types'

/** WebSocket.readyState 값. 테스트용 가짜 소켓에서도 같은 값을 쓰도록 직접 정의한다. */
const SOCKET_CONNECTING = 0
const SOCKET_OPEN = 1

/** ReconnectingSocket이 쓰는 WebSocket 기능만 모은 형태 (테스트에서 가짜 소켓을 넣을 수 있게) */
export interface WebSocketLike {
  readonly readyState: number
  binaryType: BinaryType
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
  send(data: string): void
  close(): void
}

export interface HeartbeatOptions {
  intervalMs: number
  /** 주기적으로 보낼 애플리케이션 레벨 메시지 (예: 업비트 "PING") */
  payload: string
}

export interface ReconnectingSocketOptions {
  /**
   * 연결할 주소 목록. 연결이 한 번도 열리지 않고 실패하면 다음 주소로 넘어간다.
   * (지역 제한 등으로 한 도메인이 막힌 경우를 위한 대체 경로)
   */
  endpointUrls: readonly [string, ...string[]]
  binaryType: BinaryType | null
  /** 연결이 열릴 때마다 호출된다. 구독 메시지는 여기서 다시 보낸다. */
  onOpen: (socket: WebSocketLike) => void
  onMessage: (data: unknown) => void
  onStatusChange: (status: ConnectionStatus) => void
  /** 이 시간 동안 메시지가 없으면 죽은 연결로 보고 다시 연결한다. */
  staleTimeoutMs: number
  heartbeat: HeartbeatOptions | null
  reconnectDelay: ReconnectDelayOptions
  /** 테스트에서 가짜 소켓, 가짜 시계, 고정 난수를 넣기 위한 값 */
  createWebSocket?: (url: string) => WebSocketLike
  getCurrentTime?: () => number
  getRandomValue?: () => number
}

/**
 * 끊기면 지수 백오프(+지터)로 자동 재연결하는 WebSocket.
 * - 일정 시간 데이터가 없으면 죽은 연결로 보고 다시 연결한다.
 * - 네트워크가 돌아오거나(online) 탭으로 돌아오면(visibilitychange) 대기 중인 재연결을 앞당긴다.
 *   단, 거래소 연결 요청 제한을 지키기 위해 최소 대기 시간(minimumDelayMs)은 건너뛰지 않는다.
 * - 연결이 열릴 때마다 onOpen이 다시 호출되므로 구독도 자동으로 복구된다.
 */
export class ReconnectingSocket {
  private readonly options: ReconnectingSocketOptions
  private readonly createWebSocket: (url: string) => WebSocketLike
  private readonly getCurrentTime: () => number
  private readonly getRandomValue: () => number

  private socket: WebSocketLike | null = null
  private endpointIndex = 0
  private failedAttemptCount = 0
  private isStopped = true
  private lastMessageAt: number | null = null
  private lastConnectStartedAt: number | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private staleTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: ReconnectingSocketOptions) {
    this.options = options
    this.createWebSocket = options.createWebSocket ?? ((url) => new WebSocket(url))
    this.getCurrentTime = options.getCurrentTime ?? Date.now
    this.getRandomValue = options.getRandomValue ?? Math.random
  }

  get currentEndpointUrl(): string {
    const { endpointUrls } = this.options
    return endpointUrls[this.endpointIndex % endpointUrls.length] ?? endpointUrls[0]
  }

  start(): void {
    if (!this.isStopped) return
    this.isStopped = false
    if (typeof window !== 'undefined') window.addEventListener('online', this.handleWake)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.handleWake)
    this.connect()
  }

  stop(): void {
    if (this.isStopped) return
    this.isStopped = true
    this.clearTimers()
    if (typeof window !== 'undefined') window.removeEventListener('online', this.handleWake)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.handleWake)
    this.disposeSocket()
    this.emitStatus('closed', { reason: '구독 종료' })
  }

  /** 거래소가 곧 연결을 끊겠다고 알려 온 경우 등, 지금 연결을 버리고 다시 연결한다. */
  restart(reason: string): void {
    if (this.isStopped) return
    this.disposeSocket()
    this.scheduleReconnect(reason, false)
  }

  private connect(): void {
    if (this.isStopped) return
    this.clearTimers()
    this.emitStatus(this.failedAttemptCount === 0 ? 'connecting' : 'reconnecting')
    this.lastConnectStartedAt = this.getCurrentTime()

    let socket: WebSocketLike
    try {
      socket = this.createWebSocket(this.currentEndpointUrl)
    } catch (error) {
      this.scheduleReconnect(`연결 생성 실패 (${describeError(error)})`, true)
      return
    }
    if (this.options.binaryType !== null) socket.binaryType = this.options.binaryType
    this.socket = socket

    let hasOpened = false
    socket.onopen = () => {
      hasOpened = true
      this.failedAttemptCount = 0
      this.lastMessageAt = this.getCurrentTime()
      this.emitStatus('open')
      this.options.onOpen(socket)
      this.armStaleTimer()
      this.startHeartbeat(socket)
    }
    socket.onmessage = (event) => {
      this.lastMessageAt = this.getCurrentTime()
      this.armStaleTimer()
      this.options.onMessage(event.data)
    }
    socket.onclose = (event) => {
      this.socket = null
      this.scheduleReconnect(`연결 끊김 (코드 ${event.code})`, !hasOpened)
    }
    // 브라우저는 onerror 뒤에 항상 onclose를 호출하므로 재연결은 onclose에서만 처리한다.
    socket.onerror = () => {}
  }

  private scheduleReconnect(reason: string, connectionNeverOpened: boolean): void {
    this.clearTimers()
    if (this.isStopped) return
    // 한 번도 열리지 않았다면 이 주소가 막혔을 수 있으므로 다음 주소로 넘어간다.
    if (connectionNeverOpened) this.endpointIndex = (this.endpointIndex + 1) % this.options.endpointUrls.length
    this.failedAttemptCount += 1
    const delayMs = calculateReconnectDelayMs(
      this.failedAttemptCount,
      this.options.reconnectDelay,
      this.getRandomValue(),
    )
    this.emitStatus('reconnecting', { reason, nextRetryAt: this.getCurrentTime() + delayMs })
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delayMs)
  }

  private readonly handleWake = (): void => {
    if (this.isStopped) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

    if (this.socket?.readyState === SOCKET_OPEN) {
      // 백그라운드에서 타이머가 멈춰 있는 동안 연결이 죽었을 수 있다.
      const isStale =
        this.lastMessageAt !== null && this.getCurrentTime() - this.lastMessageAt > this.options.staleTimeoutMs
      if (isStale) this.restart('탭 복귀 후 데이터 없음')
      return
    }

    if (this.reconnectTimer !== null) {
      const earliestAllowedAt = (this.lastConnectStartedAt ?? 0) + this.options.reconnectDelay.minimumDelayMs
      if (this.getCurrentTime() >= earliestAllowedAt) this.connect()
    }
  }

  private armStaleTimer(): void {
    if (this.staleTimer !== null) clearTimeout(this.staleTimer)
    this.staleTimer = setTimeout(() => this.restart('데이터 수신 없음'), this.options.staleTimeoutMs)
  }

  private startHeartbeat(socket: WebSocketLike): void {
    const { heartbeat } = this.options
    if (heartbeat === null) return
    this.heartbeatTimer = setInterval(() => {
      if (socket.readyState === SOCKET_OPEN) socket.send(heartbeat.payload)
    }, heartbeat.intervalMs)
  }

  /** 현재 소켓의 핸들러를 떼고 닫는다 (onclose가 재연결을 한 번 더 예약하지 않도록). */
  private disposeSocket(): void {
    const socket = this.socket
    this.socket = null
    if (socket === null) return
    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null
    if (socket.readyState === SOCKET_CONNECTING || socket.readyState === SOCKET_OPEN) socket.close()
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer)
    if (this.staleTimer !== null) clearTimeout(this.staleTimer)
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer)
    this.reconnectTimer = null
    this.staleTimer = null
    this.heartbeatTimer = null
  }

  private emitStatus(
    state: ConnectionState,
    details: { reason?: string; nextRetryAt?: number } = {},
  ): void {
    this.options.onStatusChange({
      state,
      failedAttemptCount: this.failedAttemptCount,
      lastMessageAt: this.lastMessageAt,
      nextRetryAt: details.nextRetryAt ?? null,
      reason: details.reason ?? null,
      endpointUrl: this.currentEndpointUrl,
    })
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
