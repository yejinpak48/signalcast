import { Hono } from 'hono'

/**
 * HTTP 라우트 모음.
 * 1차에서는 상태 확인용 /health만 있다.
 * 시세를 받아 다시 제공하는 경로는 약관 규칙상 만들지 않는다 (CLAUDE.md 참고).
 */
export function createApp() {
  const app = new Hono()

  app.get('/health', (context) => context.json({ status: 'ok' }))

  return app
}
