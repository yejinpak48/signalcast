/**
 * 서버 설정. 시작할 때 환경변수를 한 번 읽고 검증한다.
 * 값이 잘못되면 바로 종료해서, 잘못된 설정으로 서버가 떠 있는 일이 없게 한다.
 * 기능 플래그는 이후 단계에서 여기에 추가하며, 기본값은 모두 꺼짐이다.
 */
export interface ServerConfig {
  port: number
}

const DEFAULT_PORT = 8787

export class ConfigError extends Error {
  override name = 'ConfigError'
}

function readPort(rawValue: string | undefined): number {
  if (rawValue === undefined || rawValue.trim() === '') return DEFAULT_PORT
  const port = Number(rawValue)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigError(`PORT 값이 올바르지 않습니다: "${rawValue}"`)
  }
  return port
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: readPort(environment['PORT']),
  }
}
