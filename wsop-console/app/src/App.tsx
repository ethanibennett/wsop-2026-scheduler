import { useState } from 'react'
import { BottomNav, type TabId } from './components/BottomNav'
import { useStore } from './store'
import { TodayScreen } from './screens/TodayScreen'
import { SessionsScreen } from './screens/SessionsScreen'
import { BankrollScreen } from './screens/BankrollScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { PlanScreen } from './screens/PlanScreen'
import { TrainingScreen, ReviewScreen } from './screens/PlaceholderScreens'

export function App() {
  const [tab, setTab] = useState<TabId>('today')
  const { ready } = useStore()

  if (!ready) {
    return (
      <div className="app">
        <div className="empty" style={{ marginTop: '40vh' }}>
          <div className="big">◆</div>
          Loading…
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {tab === 'today' && <TodayScreen />}
      {tab === 'sessions' && <SessionsScreen />}
      {tab === 'bankroll' && <BankrollScreen />}
      {tab === 'training' && <TrainingScreen />}
      {tab === 'plan' && <PlanScreen />}
      {tab === 'review' && <ReviewScreen />}
      {tab === 'settings' && <SettingsScreen />}
      <BottomNav tab={tab} onChange={setTab} />
    </div>
  )
}
