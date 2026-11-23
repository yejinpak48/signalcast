/** 거래소 식별자. 새 거래소를 추가하면 여기에 id를 더하고 index.ts에 등록한다. */
export type ExchangeId = 'upbit' | 'binance'

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface ConnectionStatus {
  state: ConnectionState
  /** 연속으로 실패한 연결 시도 횟수. 연결에 성공하면 0으로 돌아간다. */
  failedAttemptCount: number
  /** 마지막으로 메시지를 받은 시각 (ms) */
  lastMessageAt: number | null
  /** 다음 재연결 예정 시각 (ms). 재연결을 기다리는 중일 때만 값이 있다. */
  nextRetryAt: number | null
  /** 마지막으로 끊긴 이유 (화면 표시용) */
  reason: string | null
  /** 지금 연결 중이거나 연결된 주소 */
  endpointUrl: string
}

/** 거래소에서 받은 체결 가격 하나 */
export interface PriceTick {
  exchange: ExchangeId
  /** 거래소 마켓 코드 (예: 업비트 "KRW-BTC", 바이낸스 "BTCUSDT") */
  symbol: string
  /** 원화 마켓이면 원, USDT 마켓이면 USDT 단위 */
  price: number
  /** 거래소 기준 체결 시각 (ms) */
  tradedAt: number
}

export interface PriceSubscriptionHandlers {
  onPriceTick: (priceTick: PriceTick) => void
  onStatusChange: (status: ConnectionStatus) => void
}

/**
 * 거래소 실시간 시세 연결.
 * 브라우저가 거래소 공개 WebSocket에 직접 연결한다 (서버를 거치지 않는다).
 */
export interface ExchangePriceSource {
  id: ExchangeId
  displayName: string
  /** 마켓 코드 목록을 구독하고, 구독을 끝내는 함수를 돌려준다. */
  subscribeToPrices: (symbols: readonly string[], handlers: PriceSubscriptionHandlers) => () => void
}
