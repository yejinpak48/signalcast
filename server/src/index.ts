import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { ConfigError, loadConfig } from './config.js'

function start() {
  let config
  try {
    config = loadConfig()
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`[설정 오류] ${error.message}`)
      process.exit(1)
    }
    throw error
  }

  const app = createApp()
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`Signalcast 서버 시작: http://localhost:${info.port}`)
  })
}

start()
