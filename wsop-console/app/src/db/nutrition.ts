// Nutrition content (M5) — ported from docs/plan/nutrition.md ("The 45 Layer").
// Defaults, not a meal plan: protein-first, modest deficit, stock-the-kitchen.
// Static reference + a standing shopping list (checks persisted in localStorage).

export interface Principle {
  title: string
  body: string
}

export const PROTEIN_TARGET = '~110–150 g/day (~30–40 g per meal)'

export const PRINCIPLES: Principle[] = [
  {
    title: 'Protein first',
    body: 'The single biggest lever. At 45 the body uses protein less efficiently, so it protects muscle in the deficit and drives recovery. Protein with every meal, ~0.7–1 g per lb of goal weight, spread across the day. Hit it most days — a guide, not a tracking prison.',
  },
  {
    title: 'Modest deficit, not aggressive',
    body: '~1 lb/week — slow enough to keep muscle. It comes from the defaults + training, not from slashing calories. Crash deficits at 45 strip muscle and tank recovery and play.',
  },
  {
    title: 'Defaults, not a meal plan',
    body: 'A protein-forward breakfast, good options stocked so the lazy choice is a fine choice, water at the table. Consistency beats precision.',
  },
  {
    title: 'Fix the poker-lifestyle pattern',
    body: "Late nights breed the real problem: skip meals → binge → energy drinks → junk at the table. Counter it: don't skip, real food stocked for sessions, steady hydration, and the caffeine cutoff (matters more at 45 — caffeine lingers longer).",
  },
  {
    title: 'Recovery + joints',
    body: 'Enough protein, whole foods, and omega-3s support slower recovery and the joint/tendon health the PF/knee history needs. Bias toward whole foods and adequacy over restriction.',
  },
  {
    title: 'Alcohol hits harder now',
    body: 'It blunts recovery and sleep more at 45 — the live-room default is to drink; yours isn’t, on session nights especially. Save it for the off, in moderation.',
  },
]

// Protein-first mapped onto the Phase-1 hourly templates.
export interface DayMeal {
  when: string
  title: string
  body: string
}

export const DAY_EATING: DayMeal[] = [
  {
    when: '10:00',
    title: 'Protein breakfast — every day',
    body: 'The anchor meal: ~30–40 g protein so the day opens ahead on the lever. Eggs + whatever’s around, Greek yogurt + fruit + nuts, or a shake on a rushed morning.',
  },
  {
    when: '~13:00',
    title: 'The default plate',
    body: 'Protein + vegetables + a smart carb, same shape most days so it’s automatic.',
  },
  {
    when: '~16:45',
    title: 'Pre-session meal (live nights)',
    body: 'The most important poker meal. Protein + slower carbs, moderate, nothing heavy. ~90 min before you sit: steady energy + pre-empts the casino-food default. Walk in fueled.',
  },
  {
    when: 'in-session',
    title: 'In-session fuel',
    body: 'Real food stashed — jerky, nuts, a proper sandwich — water constant. Never get hungry enough to start the energy-drink spiral. Sunday MTT: the dinner-break is non-negotiable, protein-first.',
  },
  {
    when: '01:00–01:30',
    title: 'The late-night rule',
    body: 'A big late meal wrecks sleep. Front-load earlier so you reach wind-down satisfied. If you genuinely need something, keep it small and protein-forward (Greek yogurt, cottage cheese, turkey) — not a carb-and-grease binge.',
  },
  {
    when: 'Mon / Thu',
    title: 'Clean deficit days',
    body: 'No session to disrupt eating, plus the shared dinner — the easiest days to eat well. Make the shared dinner protein-first and genuinely good.',
  },
]

export const PHASING: { phase: string; note: string }[] = [
  { phase: 'Build (1–3)', note: 'The modest deficit runs here — most of the 30 lbs comes off (paused for the W4 surgery window). Protein high throughout.' },
  { phase: 'Grind (4)', note: 'At goal → maintenance. Keep protein high to hold muscle through the volume.' },
  { phase: 'WSOP (5)', note: 'Fuel for performance, not a deficit — steady energy across 12-hour days, avoid the dinner-break crash, manage caffeine for the long day.' },
  { phase: 'Landing (6)', note: 'Recovery eating, back to home defaults.' },
]

export const SURGERY_NOTE =
  'Around the W4 surgery the deficit pauses — healing needs fuel. No cut: eat to adequacy with protein high. Hydration + gentle fiber (pain meds back things up). Resume the deficit gently from W5–6. Flag supplements (esp. fish oil) to the surgeon ahead of the date. (Follow your surgeon’s actual guidance.)'

export const DEFAULT_PLATES: { label: string; body: string }[] = [
  { label: 'Breakfast', body: 'Eggs / Greek yogurt / a shake — pick a protein, add fruit or veg.' },
  { label: 'Lunch & dinner', body: 'A palm-or-two of protein + a pile of veg + a fist of smart carb (rice, potato, oats, beans).' },
  { label: 'Session snacks', body: 'Jerky, nuts, cheese, a pre-made protein sandwich, a shake.' },
  { label: 'Post-session (only if needed)', body: 'Something small and protein-forward.' },
]

// The standing shopping list — staples to keep stocked, grouped by category.
export interface ShopCategory {
  category: string
  items: string[]
}

export const SHOPPING_LIST: ShopCategory[] = [
  {
    category: 'Protein (the anchor of every grab)',
    items: [
      'Eggs (and/or liquid egg whites)',
      'High-protein Greek yogurt + cottage cheese',
      'Chicken — fresh + a pre-cooked/rotisserie for lazy nights',
      'Lean ground beef or turkey',
      'Fatty fish for omega-3s (salmon — fresh, frozen, or canned)',
      'Canned tuna/salmon (shelf-stable backup)',
      'Deli turkey/chicken',
      'Whey/casein protein powder',
    ],
  },
  {
    category: 'Vegetables (volume + micros)',
    items: [
      'Frozen broccoli / spinach / mixed veg — the no-spoil default',
      'Bagged salad + fresh veg you’ll genuinely eat',
    ],
  },
  {
    category: 'Smart carbs',
    items: [
      'Rice (microwave pouches) + oats',
      'Potatoes / sweet potatoes',
      'Canned beans / lentils',
      'Whole-grain bread or wraps',
    ],
  },
  {
    category: 'Session snacks (grab-and-go)',
    items: ['Jerky / biltong', 'Mixed nuts, almonds', 'String cheese / Babybel', 'Decent protein bars'],
  },
  {
    category: 'Fruit + extras',
    items: [
      'Berries, bananas, apples',
      'Olive oil, avocado, nut butter',
      'Zero-sugar electrolyte packets',
      'Spices, hot sauce, mustard, salsa',
    ],
  },
]

export const LAZY_HEROES =
  'Lazy-day heroes (zero cooking): rotisserie chicken, microwave rice, canned tuna, Greek yogurt, jerky, a shake. On a brutal day these are the meal — and still on target.'

export const SHOP_TIMING =
  'Monday early afternoon — the weekly stock-up: no poker, daytime open, lands before Tuesday’s live night. Pair with ~20 min light prep (hard-boil eggs, portion session baggies, cook a protein batch). Optional Thursday top-up for perishables.'
