import { KimchiPremiumPage } from '../features/kimchiPremium/KimchiPremiumPage'

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Signalcast</h1>
        <p className="app-subtitle">업비트·바이낸스 실시간 김치 프리미엄</p>
      </header>
      <main className="app-main">
        <KimchiPremiumPage />
      </main>
    </div>
  )
}
