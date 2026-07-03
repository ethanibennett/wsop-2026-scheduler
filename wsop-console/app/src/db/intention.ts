// The pre-session intention (playbook W1 ritual): one line set BEFORE you sit.
// Stored per-date in localStorage; read back by the session form at log time so
// the post-session journal closes the loop against it.

const INTENT_KEY = 'wsop-intention' // { date, text }

export function readIntention(date: string): string {
  try {
    const raw = localStorage.getItem(INTENT_KEY)
    if (!raw) return ''
    const v = JSON.parse(raw) as { date: string; text: string }
    return v.date === date ? v.text : ''
  } catch {
    return ''
  }
}

export function saveIntention(date: string, text: string): void {
  localStorage.setItem(INTENT_KEY, JSON.stringify({ date, text }))
}
