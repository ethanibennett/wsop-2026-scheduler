// App-icon badge (iOS 16.4+ installed PWAs support setAppBadge). Shows the
// count of open needs-doing items — "things waiting on you," glanceable from
// the home screen. Feature-detected; a no-op everywhere else.

export function updateAppBadge(): void {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (typeof nav.setAppBadge !== 'function') return
    let backlog: { done?: boolean }[] = []
    try {
      backlog = JSON.parse(localStorage.getItem('wsop-home-backlog') || '[]')
    } catch {
      backlog = []
    }
    const open = backlog.filter((b) => !b.done).length
    if (open > 0) void nav.setAppBadge(open)
    else void nav.clearAppBadge?.()
  } catch {
    /* badge is best-effort */
  }
}
