/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 시세는 브라우저가 거래소에 직접 연결해서 받는다.
// 거래소 요청을 대신 보내는 프록시는 약관 규칙상 두지 않는다 (CLAUDE.md 참고).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
  },
})
