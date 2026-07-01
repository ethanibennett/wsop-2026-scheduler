# docs/plan/ — content source of truth

⚠️ **These plan docs were NOT present in the repo when the app was scaffolded.**
Drop them here; they are the content source for the screens noted below.

| Doc | Feeds | Milestone |
|---|---|---|
| `phase-1-playbook.md` | Today routines/day-types, Plan standard-week grid | M4/M5 |
| `bankroll-framework.md` | Bankroll ladder, checkpoints, volume ramp, floors | M1 (values currently inlined in `app/src/engine/bankroll.ts` + `seed.ts` as placeholders) |
| `training-plan.md` | Training screen lift menu, benchmarks, prehab | M3 |
| `nutrition.md` | Nutrition defaults, shopping list, fueling | M5 |
| `mental-health-and-game.md` | Sunday-review prompts, mental-game install | M6 |
| `business-admin.md` | Admin / tax / staking | later |

When these land, replace the placeholder seed data in
`app/src/db/seed.ts` and confirm the bankroll constants in
`app/src/engine/bankroll.ts` match `bankroll-framework.md`.
