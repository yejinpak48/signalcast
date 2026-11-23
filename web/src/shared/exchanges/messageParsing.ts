const textDecoder = new TextDecoder()

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** WebSocket 메시지를 문자열로 바꾼다. 텍스트와 바이너리(ArrayBuffer) 메시지를 모두 받는다. */
export function decodeMessageText(data: unknown): string | null {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return textDecoder.decode(data)
  return null
}

/** JSON 파싱에 실패하면 예외 대신 undefined를 돌려준다. */
export function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

export function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
