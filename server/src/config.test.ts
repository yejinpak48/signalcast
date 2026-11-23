import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './config.js'

describe('loadConfig', () => {
  it('PORT가 없으면 기본 포트를 쓴다', () => {
    expect(loadConfig({}).port).toBe(8787)
  })

  it('PORT 값을 숫자로 읽는다', () => {
    expect(loadConfig({ PORT: '3000' }).port).toBe(3000)
  })

  it('잘못된 PORT 값이면 설정 오류를 던진다', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(ConfigError)
    expect(() => loadConfig({ PORT: '70000' })).toThrow(ConfigError)
  })
})
