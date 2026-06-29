export type TabId =
  | 'today'
  | 'dash'
  | 'sessions'
  | 'bankroll'
  | 'training'
  | 'health'
  | 'plan'
  | 'review'
  | 'settings'

const TABS: { id: TabId; label: string; ic: string }[] = [
  { id: 'today', label: 'Today', ic: '◎' },
  { id: 'dash', label: 'Dash', ic: '▦' },
  { id: 'sessions', label: 'Sessions', ic: '▤' },
  { id: 'bankroll', label: 'Bankroll', ic: '◆' },
  { id: 'training', label: 'Train', ic: '⬓' },
  { id: 'health', label: 'Health', ic: '✚' },
  { id: 'plan', label: 'Plan', ic: '◷' },
  { id: 'review', label: 'Review', ic: '✎' },
  { id: 'settings', label: 'Settings', ic: '⚙' },
]

export function BottomNav({
  tab,
  onChange,
}: {
  tab: TabId
  onChange: (t: TabId) => void
}) {
  return (
    <nav className="bottom-nav">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`nav-tab${tab === t.id ? ' on' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span className="ic">{t.ic}</span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
