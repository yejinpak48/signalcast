import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReconnectingSocket, type ReconnectingSocketOptions, type WebSocketLike } from './reconnectingSocket'
import type { ConnectionStatus } from './types'

/** 테스트용 가짜 WebSocket. 열기, 메시지 받기, 끊기를 직접 일으킨다. */
class FakeWebSocket implements WebSocketLike {
  readyState = 0
  binaryType: BinaryType = 'blob'
  onopen: WebSocketLike['onopen'] = null
  onmessage: WebSocketLike['onmessage'] = null
  onclose: WebSocketLike['onclose'] = null
  onerror: WebSocketLike['onerror'] = null
  readonly sentMessages: string[] = []
  readonly url: string

  constructor(url: string) {
    this.url = url
  }

  send(data: string) {
    this.sentMessages.push(data)
  }

  close() {
    this.readyState = 3
  }

  simulateOpen() {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent)
  }

  simulateClose(code = 1006) {
    this.readyState = 3
    this.onclose?.({ code } as CloseEvent)
  }
}

const NO_JITTER = 0.5

function setUpSocket(overrides: Partial<ReconnectingSocketOptions> = {}) {
  const createdSockets: FakeWebSocket[] = []
  const statuses: ConnectionStatus[] = []
  const receivedMessages: unknown[] = []
  const reconnectingSocket = new ReconnectingSocket({
    endpointUrls: ['wss://primary.example', 'wss://fallback.example'],
    binaryType: null,
    onOpen: (socket) => socket.send('subscribe'),
    onMessage: (data) => receivedMessages.push(data),
    onStatusChange: (status) => statuses.push(status),
    staleTimeoutMs: 20_000,
    heartbeat: null,
    reconnectDelay: { baseDelayMs: 1_000, maxDelayMs: 30_000, jitterRatio: 0.25, minimumDelayMs: 0 },
    createWebSocket: (url) => {
      const socket = new FakeWebSocket(url)
      createdSockets.push(socket)
      return socket
    },
    getCurrentTime: () => Date.now(),
    getRandomValue: () => NO_JITTER,
    ...overrides,
  })
  const latestSocket = () => {
    const socket = createdSockets.at(-1)
    if (!socket) throw new Error('아직 만들어진 소켓이 없습니다')
    return socket
  }
  return { reconnectingSocket, createdSockets, statuses, receivedMessages, latestSocket }
}

describe('ReconnectingSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('연결이 열리면 구독 메시지를 보내고 메시지를 전달한다', () => {
    const { reconnectingSocket, latestSocket, receivedMessages, statuses } = setUpSocket()
    reconnectingSocket.start()
    latestSocket().simulateOpen()
    latestSocket().simulateMessage('hello')

    expect(latestSocket().sentMessages).toEqual(['subscribe'])
    expect(receivedMessages).toEqual(['hello'])
    expect(statuses.at(-1)?.state).toBe('open')
    reconnectingSocket.stop()
  })

  it('열렸던 연결이 끊기면 같은 주소로 백오프 후 다시 연결하고 다시 구독한다', () => {
    const { reconnectingSocket, createdSockets, latestSocket, statuses } = setUpSocket()
    reconnectingSocket.start()
    latestSocket().simulateOpen()
    latestSocket().simulateClose()

    expect(statuses.at(-1)).toMatchObject({ state: 'reconnecting', failedAttemptCount: 1 })
    vi.advanceTimersByTime(999)
    expect(createdSockets).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(createdSockets).toHaveLength(2)
    expect(latestSocket().url).toBe('wss://primary.example')

    latestSocket().simulateOpen()
    expect(latestSocket().sentMessages).toEqual(['subscribe'])
    expect(statuses.at(-1)).toMatchObject({ state: 'open', failedAttemptCount: 0 })
    reconnectingSocket.stop()
  })

  it('한 번도 열리지 않고 실패하면 다음 주소로 넘어가고, 대기 시간이 늘어난다', () => {
    const { reconnectingSocket, latestSocket } = setUpSocket()
    reconnectingSocket.start()
    latestSocket().simulateClose()
    vi.advanceTimersByTime(1_000)
    expect(latestSocket().url).toBe('wss://fallback.example')

    latestSocket().simulateClose()
    vi.advanceTimersByTime(1_999)
    expect(latestSocket().url).toBe('wss://fallback.example')
    vi.advanceTimersByTime(1)
    expect(latestSocket().url).toBe('wss://primary.example')
    reconnectingSocket.stop()
  })

  it('계속 실패해도 실제 재연결 대기 시간은 상한(30초)에서 멈춘다', () => {
    const { reconnectingSocket, createdSockets, latestSocket, statuses } = setUpSocket()
    reconnectingSocket.start()
    const observedDelaysMs: number[] = []

    for (let failureIndex = 0; failureIndex < 8; failureIndex += 1) {
      latestSocket().simulateClose()
      const nextRetryAt = statuses.at(-1)?.nextRetryAt
      if (nextRetryAt == null) throw new Error('재연결 예정 시각이 없습니다')
      const delayMs = nextRetryAt - Date.now()
      observedDelaysMs.push(delayMs)

      // 예정 시각 직전에는 새 연결이 없고, 정확히 그 시각에 새 연결이 생긴다.
      const socketCountBefore = createdSockets.length
      vi.advanceTimersByTime(delayMs - 1)
      expect(createdSockets).toHaveLength(socketCountBefore)
      vi.advanceTimersByTime(1)
      expect(createdSockets).toHaveLength(socketCountBefore + 1)
    }

    expect(observedDelaysMs).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000])
    reconnectingSocket.stop()
  })

  it('지터가 가장 클 때도 실제 대기 시간은 상한을 넘지 않는다', () => {
    const { reconnectingSocket, latestSocket, statuses } = setUpSocket({ getRandomValue: () => 0.999_999 })
    reconnectingSocket.start()
    const observedDelaysMs: number[] = []

    for (let failureIndex = 0; failureIndex < 8; failureIndex += 1) {
      latestSocket().simulateClose()
      const delayMs = (statuses.at(-1)?.nextRetryAt ?? Number.NaN) - Date.now()
      observedDelaysMs.push(delayMs)
      vi.advanceTimersByTime(delayMs)
    }

    expect(observedDelaysMs[0]).toBe(1_250)
    expect(Math.max(...observedDelaysMs)).toBe(30_000)
    reconnectingSocket.stop()
  })

  it('실제 대기 시간은 지터 범위(±25%) 안에 있다', () => {
    for (const [randomValue, expectedDelayMs] of [
      [0, 750],
      [0.5, 1_000],
      [0.999_999, 1_250],
    ] as const) {
      const { reconnectingSocket, latestSocket, statuses } = setUpSocket({ getRandomValue: () => randomValue })
      reconnectingSocket.start()
      latestSocket().simulateClose()
      expect((statuses.at(-1)?.nextRetryAt ?? Number.NaN) - Date.now()).toBe(expectedDelayMs)
      reconnectingSocket.stop()
    }
  })

  it('최소 대기 시간이 있으면 지터가 가장 작을 때도 그보다 빨리 다시 연결하지 않는다', () => {
    const { reconnectingSocket, createdSockets, latestSocket } = setUpSocket({
      reconnectDelay: { baseDelayMs: 10_000, maxDelayMs: 60_000, jitterRatio: 0.25, minimumDelayMs: 10_000 },
      getRandomValue: () => 0,
    })
    reconnectingSocket.start()
    latestSocket().simulateClose()
    vi.advanceTimersByTime(9_999)
    expect(createdSockets).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(createdSockets).toHaveLength(2)
    reconnectingSocket.stop()
  })

  it('데이터가 일정 시간 없으면 죽은 연결로 보고 다시 연결한다', () => {
    const { reconnectingSocket, createdSockets, latestSocket, statuses } = setUpSocket()
    reconnectingSocket.start()
    latestSocket().simulateOpen()
    vi.advanceTimersByTime(19_999)
    latestSocket().simulateMessage('still alive')
    vi.advanceTimersByTime(19_999)
    expect(createdSockets).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(statuses.at(-1)).toMatchObject({ state: 'reconnecting', reason: '데이터 수신 없음' })
    vi.advanceTimersByTime(1_000)
    expect(createdSockets).toHaveLength(2)
    reconnectingSocket.stop()
  })

  it('heartbeat가 있으면 연결된 동안 주기적으로 보낸다', () => {
    const { reconnectingSocket, latestSocket } = setUpSocket({
      heartbeat: { intervalMs: 60_000, payload: 'PING' },
      staleTimeoutMs: 1_000_000,
    })
    reconnectingSocket.start()
    latestSocket().simulateOpen()
    vi.advanceTimersByTime(120_000)
    expect(latestSocket().sentMessages).toEqual(['subscribe', 'PING', 'PING'])
    reconnectingSocket.stop()
  })

  it('restart는 지금 연결을 닫고 다시 연결한다', () => {
    const { reconnectingSocket, createdSockets, latestSocket } = setUpSocket()
    reconnectingSocket.start()
    const firstSocket = latestSocket()
    firstSocket.simulateOpen()
    reconnectingSocket.restart('서버 종료 예고')

    expect(firstSocket.readyState).toBe(3)
    vi.advanceTimersByTime(1_000)
    expect(createdSockets).toHaveLength(2)
    reconnectingSocket.stop()
  })

  it('stop 이후에는 끊겨도 다시 연결하지 않는다', () => {
    const { reconnectingSocket, createdSockets, latestSocket, statuses } = setUpSocket()
    reconnectingSocket.start()
    const socket = latestSocket()
    socket.simulateOpen()
    reconnectingSocket.stop()
    socket.simulateClose()
    vi.advanceTimersByTime(60_000)

    expect(createdSockets).toHaveLength(1)
    expect(socket.readyState).toBe(3)
    expect(statuses.at(-1)?.state).toBe('closed')
  })
})
