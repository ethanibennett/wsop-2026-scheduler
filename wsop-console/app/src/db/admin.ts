// Business & Admin content — ported from docs/plan/business-admin.md.
// "Not glamorous, but load-bearing." NOT tax/legal/financial advice — the
// landscape + the agenda to put in front of the specialist CPA.

// The actionable setup checklist, grouped by phase. Checks persist in
// localStorage (these are one-time setup tasks, not daily logs).
export interface AdminTask {
  id: string
  label: string
  detail: string
}

export interface AdminPhaseGroup {
  phase: string
  tasks: AdminTask[]
}

export const ADMIN_CHECKLIST: AdminPhaseGroup[] = [
  {
    phase: 'Phase 1 — setup (now)',
    tasks: [
      { id: 'tracking', label: 'Stand up the tracking system', detail: 'Log every session — this app is it. The keystone the bankroll rules and tax records both depend on. Never let it lapse.' },
      { id: 'accounts', label: 'Open segregated accounts', detail: 'Real, separate accounts mirroring the buckets: Playing roll · WSOP fund · Taxes · Life. Structure beats willpower.' },
      { id: 'retirement', label: 'Open a retirement vehicle', detail: 'SEP-IRA or Solo 401(k) — tax-advantaged, built for self-employment, and reduces taxable income. A fee-only advisor for the non-poker base.' },
      { id: 'cpa', label: 'Book the proactive CPA session', detail: 'The leverage is using the specialist before WSOP, not at filing: the 90% rule against your volume, quarterly-estimate sizing, multi-state, the retirement vehicle.' },
      { id: 'surgery', label: 'Confirm surgery coverage before booking', detail: 'Check the hernia repair + colonoscopy are in-network; know the deductible and out-of-pocket max. A phone call, not a project.' },
      { id: 'phenom-wallet', label: 'Set up the Phenom USDT (Tether) wallet', detail: 'The unlock for the mixed-game reps on Phenom — get the Tether wallet working on their network so deposits/withdrawals are painless, then start the 5/10 rotation.' },
    ],
  },
  {
    phase: 'Phase 3–4 — before the series',
    tasks: [
      { id: 'staking-paper', label: 'Draw up staking agreements', detail: 'The paperwork, not just the commitments: markup, % sold, makeup terms, a per-entry ledger. Don’t reconstruct it in July.' },
      { id: 'wsop-tax', label: 'WSOP tax prep with the CPA', detail: 'How the full-prize reporting + backer distribution nets out under the 90% rule. Structure the reporting before you cash.' },
    ],
  },
  {
    phase: 'Phase 5–6 — series + landing',
    tasks: [
      { id: 'log-entries', label: 'Log every entry, cash, W-2G live', detail: 'Don’t reconstruct $200k of action from memory in August. Capture it as it happens.' },
      { id: 'reconcile', label: 'Reconcile the year + settle backers', detail: 'Hand the CPA clean books. Settle backer shares against the documented agreements.' },
    ],
  },
]

export interface RefCard {
  title: string
  body: string
}

export const ADMIN_REFERENCE: RefCard[] = [
  {
    title: 'The 2026 tax change (OBBBA)',
    body: 'Starting TY2026, gambling losses are only 90% deductible against winnings (down from 100%). Losses still can’t exceed winnings or carry forward. Win $250k / lose $250k (break-even) → you can deduct only $225k, so you’re taxed on $25k you never pocketed. High-variance tournament play is the worst-case profile. There’s a push (NV lawmakers) to reverse it — plan under current law, treat upside as a bonus.',
  },
  {
    title: 'Staking — the real trap',
    body: 'When you cash, the casino reports the full prize under your SSN. Backers’ shares are not your income — but only if documented cleanly. Sloppy records → you risk being taxed on the whole cash, including money handed straight to backers, with the 90% cap on top. Protection: written agreements, a per-entry ledger, a CPA who structures the reporting, a reputable platform for the paper trail.',
  },
  {
    title: 'Banking & fund segregation',
    body: 'Mirror the bankroll buckets with real, separate accounts: Playing roll · WSOP fund · Taxes (park your tax % out of every win — it was never yours) · Life. Segregation stops you spending the tax money or dipping the WSOP fund on a Tuesday, and makes the CPA’s job dramatically cleaner.',
  },
  {
    title: 'Retirement (the 45 lens)',
    body: 'The roll is working capital, not a retirement plan. SEP-IRA / Solo 401(k) are tax-advantaged and reduce taxable income. A fee-only (flat-fee) advisor builds the non-poker base. The quiet long-game most grinders skip and regret.',
  },
  {
    title: 'Entity / structure — settled',
    body: 'Professional on Schedule C, no LLC — standard and usually correct for pure poker income. Only revisit if the solver project becomes a product or staking grows into its own business — then an LLC to house that (not the poker) is a one-line CPA question. Not now.',
  },
]

export const ADMIN_DISCLAIMER =
  'Not tax, legal, or financial advice — the landscape and the questions to bring your specialist CPA. Where it says “ask the CPA,” that’s the real instruction.'
