import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'

describe('createApp', () => {
  it('/health는 상태 ok를 돌려준다', async () => {
    const response = await createApp().request('/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('정의하지 않은 경로는 404다', async () => {
    const response = await createApp().request('/api/prices')
    expect(response.status).toBe(404)
  })
})
