# futurega.me Monetization Plan

Last updated: March 31, 2026

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Free Tier](#1-free-tier)
3. [Premium Tiers](#2-premium-tiers)
4. [Subscription Lengths and Pricing](#3-subscription-lengths-and-pricing)
5. [Summer Pass](#4-summer-pass)
6. [Free Trial](#5-free-trial)
7. [Feature Gating](#6-feature-gating)
8. [Pricing Benchmarks](#7-pricing-benchmarks)
9. [Growth and Conversion Tactics](#8-growth-and-conversion-tactics)
10. [Revenue Projections](#9-revenue-projections)

---

## Executive Summary

futurega.me is a poker tournament scheduling and tracking app with peak usage during the WSOP summer series (May-July) and steady usage during year-round poker festivals worldwide. The monetization model must solve a core tension: most users arrive for the summer, get intense value for 8-10 weeks, and may churn afterward. The pricing structure should make the annual plan feel like the obvious choice while still extracting fair value from summer-only users.

The recommended approach is a freemium model with two paid tiers (Pro and Pro+), three subscription lengths (monthly, summer pass, annual), and a 14-day free trial of Pro during onboarding.

---

## 1. Free Tier

The free tier must be useful enough to get users hooked during the critical first-session experience, but limited enough that any serious tournament player hits a wall within a day or two.

### Included (Free)

- Browse full tournament schedules across all venues (WSOP, Wynn, Venetian, IPO, etc.)
- Filter by date, buy-in range, variant, and venue
- View event details (structure, start time, buy-in, guarantees)
- Save up to 5 events to a personal schedule
- Basic P&L tracking for up to 5 results per month
- View friends list (but limited social features)
- Push notifications for saved events (start time reminders only)

### Limited/Excluded (Free)

- Personal schedule capped at 5 saved events (hard cap; must delete to add more)
- P&L tracking limited to 5 results per month
- No export (no CSV, no calendar sync, no PDF)
- No hand replayer access
- No table scanner
- No staking tools
- No live updates (delayed results only)
- Social features limited to viewing friends (no messaging, no shared schedules)
- Ads shown in schedule browser (non-intrusive banner; no interstitials)

### Rationale

Schedule browsing is the top-of-funnel hook. Every poker player arriving in Las Vegas needs to see what tournaments are running. Making this free ensures maximum downloads and word-of-mouth. The 5-event save limit is the key friction point. During the WSOP, a serious player enters 3-5 tournaments per week. They will hit the cap within the first two days and face a clear upgrade prompt.

---

## 2. Premium Tiers

### Tier 1: Pro ($7.99/month)

The core paid experience for tournament grinders.

| Feature | Details |
|---------|---------|
| Unlimited saved events | No cap on personal schedule |
| Full P&L tracking | Unlimited results, running totals, charts, ROI stats |
| Calendar sync | Export schedule to Apple Calendar, Google Calendar, Outlook |
| CSV/PDF export | Export results, schedule, and P&L data |
| Live updates | Real-time late reg status, field size, payouts as they post |
| Ad-free experience | All banner ads removed |
| Hand replayer | Replay and annotate key hands from sessions |
| Social features | Message friends, share schedules, compare results |
| Smart alerts | Notifications for overlay opportunities, late reg closing, soft fields |
| Multi-venue conflict detection | Automatic flagging when saved events overlap |

### Tier 2: Pro+ ($14.99/month)

For serious grinders, stakers, and players who treat poker as a business.

Everything in Pro, plus:

| Feature | Details |
|---------|---------|
| Table scanner | Live table composition data, player notes, seat availability |
| Staking tools | Create/manage staking agreements, calculate markups, track backer P&L |
| Advanced analytics | Variance analysis, session heatmaps, buy-in optimization |
| Priority support | Dedicated support channel, faster response times |
| Early access | Beta features and new venue data before general release |
| Tax-ready reports | Generate year-end summaries formatted for Schedule C / gambling income |
| Multiple profiles | Manage separate bankrolls (e.g., personal vs staked) |

### Why Two Tiers Instead of One

A single premium tier risks either underpricing (leaving money on the table from power users) or overpricing (deterring casual grinders). The two-tier model lets the majority convert at the $7.99 price point while extracting more from the ~15-20% of users who need staking, table scanning, and tax tools. The Pro+ tier also creates an aspirational upgrade path.

---

## 3. Subscription Lengths and Pricing

### Pro Tier

| Length | Price | Effective Monthly Rate | Savings vs Monthly |
|--------|-------|----------------------|-------------------|
| Monthly | $7.99/mo | $7.99 | -- |
| Summer Pass (3 months: May-Jul) | $18.99 | $6.33 | 21% off |
| Annual | $49.99/yr | $4.17 | 48% off |

### Pro+ Tier

| Length | Price | Effective Monthly Rate | Savings vs Monthly |
|--------|-------|----------------------|-------------------|
| Monthly | $14.99/mo | $14.99 | -- |
| Summer Pass (3 months: May-Jul) | $34.99 | $11.66 | 22% off |
| Annual | $99.99/yr | $8.33 | 44% off |

### Pricing Psychology

- The annual plan is priced to feel like a no-brainer compared to 3 months of monthly billing ($23.97 for Pro monthly x 3 = $23.97 vs $18.99 summer pass vs $49.99 for a full year). The annual price is barely more than double the summer pass, making the upsell easy.
- Apple and Google take 30% on first-year subscriptions and 15% on renewals. The $49.99/$99.99 annual prices account for this, yielding ~$35/$70 net revenue in year one and ~$42.50/$85 on renewals.
- All prices end in .99 to match App Store conventions.

---

## 4. Summer Pass

The Summer Pass is the most strategically important subscription length. It directly addresses the behavior of the largest user segment: players who fly into Las Vegas for the WSOP summer and leave in mid-July.

### Design

- **Duration:** 3 months, covering May 1 through July 31
- **Available for purchase:** March 1 through June 30 (creating urgency for early buyers)
- **Auto-renewal:** Does NOT auto-renew into another summer pass. Instead, at expiration on July 31, the user is offered a discounted annual upgrade ("You saved $X this summer -- lock in the full year for just $Y more"). If they decline, they revert to the free tier.
- **Early-bird pricing:** Users who purchase the Summer Pass before April 15 get an additional $2 off (e.g., Pro Summer Pass for $16.99 instead of $18.99). This captures revenue earlier and builds pre-summer buzz.

### Conversion Funnel: Summer Pass to Annual

The key revenue opportunity is converting summer-only users into annual subscribers. The strategy:

1. **During the summer:** Surface year-round festival schedules (WSOP Europe in October, Irish Poker Open in April, Wynn Millions, etc.) to demonstrate ongoing value.
2. **At summer pass expiration (late July):** Offer a prorated annual upgrade. Example: "Upgrade to Annual for just $31.00 more (that's 9 more months for the price of 4)."
3. **In the off-season:** Send targeted push notifications when major festivals are announced, with a "Re-subscribe to track this" CTA.
4. **Before next summer:** Send "Welcome back" offers in April with early-bird annual pricing.

---

## 5. Free Trial

### Structure

- **Duration:** 14 days of full Pro access (not Pro+)
- **Trigger:** Automatically starts when a new user creates an account
- **Payment required upfront:** No. The trial starts without requiring a credit card. Card is requested at conversion.
- **What's included:** All Pro features with no limitations
- **What happens after:** User reverts to the free tier. All data (saved events, P&L entries, hand histories) is preserved but read-only until they subscribe. This is critical -- the data hostage effect is the strongest conversion lever.

### Why 14 Days (Not 7 or 30)

- 7 days is too short. A player might arrive in Vegas mid-week, not play their first tournament until the weekend, and not enter a result until the following Monday. They need at least two tournament cycles to feel the value.
- 30 days is too generous. During the WSOP, 30 free days covers nearly half the summer, which undercuts the summer pass. A player arriving May 27 (WSOP opening day) would have a free trial lasting until June 26, covering most of the series.
- 14 days is the sweet spot. It covers 2-3 tournament entries, enough time to build a schedule, enter results, and experience the "I can't go back to doing this manually" moment.

### Conversion Strategy

- **Day 1:** Welcome email with quick-start guide
- **Day 7:** Mid-trial email highlighting features they have not tried yet
- **Day 10:** "4 days left" push notification with a summary of what they have tracked so far ("You've saved 12 events and tracked $3,200 in results")
- **Day 13:** "Last day tomorrow" notification with annual plan pricing emphasized
- **Day 14:** Trial expires. Data preserved, features locked. "Unlock your data" prompt on every app open.
- **Day 17 (3 days post-expiry):** "We miss you" email with a 20% discount code for the first month

---

## 6. Feature Gating

### Detailed Breakdown

| Feature | Free | Pro ($7.99/mo) | Pro+ ($14.99/mo) |
|---------|------|-----------------|-------------------|
| Browse all schedules | Yes | Yes | Yes |
| Filter by venue/date/buy-in/variant | Yes | Yes | Yes |
| View event details | Yes | Yes | Yes |
| Save events to schedule | 5 max | Unlimited | Unlimited |
| P&L result tracking | 5/month | Unlimited | Unlimited |
| Calendar sync (iCal/Google) | No | Yes | Yes |
| CSV/PDF export | No | Yes | Yes |
| Hand replayer | No | Yes | Yes |
| Live updates (field size, payouts) | No | Yes | Yes |
| Smart alerts (overlay, late reg) | No | Yes | Yes |
| Conflict detection | No | Yes | Yes |
| Social (messaging, shared schedules) | View only | Full | Full |
| Ad-free | No | Yes | Yes |
| Table scanner | No | No | Yes |
| Staking tools | No | No | Yes |
| Advanced analytics | No | No | Yes |
| Tax-ready reports | No | No | Yes |
| Multiple profiles/bankrolls | No | No | Yes |
| Priority support | No | No | Yes |

### Gating Philosophy

- **Schedule browsing is always free.** This is the acquisition funnel. Locking it behind a paywall would kill growth.
- **Tracking and export are the core monetization levers.** Once a player has entered 5 results and hits the cap, they are emotionally invested in the data. The upgrade friction is minimal.
- **Social features are partially gated.** Seeing friends' activity is free (creates FOMO and social proof). Messaging and sharing require Pro.
- **Power tools (table scanner, staking) justify the Pro+ premium.** These features serve a smaller, higher-willingness-to-pay segment. They also have higher server/data costs to operate.

---

## 7. Pricing Benchmarks

### Poker Software Landscape

| Product | Type | Pricing Model | Price Range |
|---------|------|---------------|-------------|
| PokerTracker 4 | Online hand tracking/HUD | One-time purchase | $64.99-$159.99 |
| Holdem Manager 3 | Online hand tracking/HUD | Annual subscription | $60-$100/year |
| Hand2Note 3 | Online hand tracking/HUD | Monthly/annual sub | $20-$61/month |
| SharkScope | Tournament stats database | Monthly subscription | $6-$26/month |
| PokerGO | Poker streaming | Monthly/annual sub | $19.99/mo or $99.99/yr |
| Poker Bankroll Tracker | P&L tracking app | Annual subscription | ~$25/year (EUR 24.99) |
| Nash Bankroll | P&L tracking app | Monthly/annual sub | $3.99/mo or $29.99/yr |
| PokerAtlas | Live poker room/tournament info | Freemium (PRO tier) | Not publicly listed |
| HendonMob | Tournament results database | Free | Free |

### Key Takeaways from Benchmarks

1. **Bankroll trackers are cheap ($2-4/month).** futurega.me offers far more than basic tracking, so pricing above this range is justified, but the tracking-only segment is price-sensitive.
2. **Serious poker software (HUD, stats) charges $5-60/month.** futurega.me sits between a bankroll tracker and a full HUD suite. The $7.99 Pro price is positioned at the low end of "serious tool" pricing.
3. **PokerGO charges $99.99/year for content.** futurega.me's annual Pro at $49.99 is half that price, which feels reasonable for a utility app vs. a content platform.
4. **SharkScope's tiered model ($6/$12/$26) is the closest analog.** futurega.me's two-tier approach at $7.99/$14.99 monthly is in the same band.
5. **No direct competitor exists** in the "live tournament scheduling + tracking + social" space for festival-goers. This is a category-creation opportunity with pricing flexibility.

---

## 8. Growth and Conversion Tactics

### Referral Program

- **Mechanic:** Every Pro/Pro+ subscriber gets a unique referral code. When a referred user subscribes to any paid plan, both the referrer and the new subscriber get 1 month free (credited as account credit toward their next billing cycle).
- **Viral loop:** During the WSOP, players constantly recommend tools to each other at the table. A simple "Share your code" button in the app makes this frictionless.
- **Cap:** Referrers can earn up to 6 free months per year to prevent abuse.

### Group/Crew Discounts

- **"Squad Plan":** Groups of 4+ who subscribe together (linked by a group code) get 15% off annual plans. This targets poker friend groups and staking stables who travel to festivals together.
- **Implementation:** One person creates a group, shares a code, and others join before purchasing. Discount applied at checkout.

### Early-Bird Pricing

- **Pre-WSOP launch (March-April):** Annual Pro at $39.99 (20% off) for users who subscribe before the WSOP schedule drops. This creates a base of committed users before the rush.
- **Returning users:** Anyone who was a subscriber in 2025 gets a "loyalty" annual rate of $44.99 for 2026.

### Casino/Venue Partnerships

- **Co-marketing:** Partner with venues (Wynn, Venetian, WSOP) to include futurega.me in their tournament information materials. In exchange, the app features their schedule prominently.
- **Sponsored features:** A venue could sponsor "live updates" for their tournaments, subsidizing the feature cost while getting branding in the app.
- **On-site promotion:** QR codes at registration desks that give a free 30-day trial (extended from 14 for venue partnerships).

### Content Marketing (Pre-Summer)

- **"Ultimate WSOP Schedule Guide"** published annually in April, driving organic search traffic
- **Festival preview posts** for each major series, shared in poker communities (TwoPlusTwo, Reddit r/poker, poker Twitter/X)
- **Podcast sponsorships** on poker podcasts during April-May ramp-up

### In-App Conversion Nudges

- **Soft paywall moments:** When a free user tries to save a 6th event, the prompt shows exactly what they are missing: "You've hit your free limit. Pro members have saved an average of 34 events this summer."
- **Social proof:** "4,200 players are tracking their WSOP results with futurega.me Pro."
- **Loss aversion at trial expiry:** "You've tracked $8,450 in tournament results. Subscribe to keep your data accessible."

---

## 9. Revenue Projections

### Assumptions

- **Total addressable market (WSOP summer):** The 2025 WSOP recorded 246,960 total entries across 100 events. Accounting for players entering multiple events, the unique player count is estimated at 30,000-50,000. Not all are app users, but the smartphone-carrying, tech-savvy segment is large.
- **Realistic app downloads (Year 1 - summer 2026):** 8,000-15,000 downloads during the WSOP summer, driven by word-of-mouth, social media, and on-site promotion.
- **Year-round festival players:** An additional 3,000-5,000 users from non-WSOP festivals globally.
- **Free-to-paid conversion rate:** 8-12% (industry standard for freemium apps is 2-5%, but poker players are a high-intent, high-spend demographic accustomed to paying for tools).

### Conservative Scenario (Year 1)

| Metric | Value |
|--------|-------|
| Total downloads (Year 1) | 10,000 |
| Free trial starts | 10,000 |
| Trial-to-paid conversion | 10% |
| Paid subscribers | 1,000 |
| Subscription mix | 50% Summer Pass, 30% Annual, 20% Monthly |
| Pro vs Pro+ split | 75% Pro, 25% Pro+ |

**Revenue Calculation (Pro tier, 750 subscribers):**

| Plan | Subscribers | Price | Gross Revenue |
|------|-------------|-------|---------------|
| Summer Pass | 375 | $18.99 | $7,121 |
| Annual | 225 | $49.99 | $11,248 |
| Monthly (avg 2.5 months) | 150 | $7.99 x 2.5 | $2,996 |
| **Pro subtotal** | | | **$21,365** |

**Revenue Calculation (Pro+ tier, 250 subscribers):**

| Plan | Subscribers | Price | Gross Revenue |
|------|-------------|-------|---------------|
| Summer Pass | 125 | $34.99 | $4,374 |
| Annual | 75 | $99.99 | $7,499 |
| Monthly (avg 2.5 months) | 50 | $14.99 x 2.5 | $1,874 |
| **Pro+ subtotal** | | | **$13,747** |

| | Amount |
|--|--------|
| **Gross Revenue (Year 1)** | **$35,112** |
| App Store cut (30% Y1) | -$10,534 |
| **Net Revenue (Year 1)** | **$24,578** |

### Moderate Scenario (Year 2)

With retention, word-of-mouth, and expanded festival coverage:

| Metric | Value |
|--------|-------|
| Total downloads (cumulative) | 30,000 |
| Active paid subscribers | 3,000 |
| Revenue mix shift | More annual (40%), fewer monthly (10%) |
| Returning subscriber rate | 50% of Year 1 paid users renew |

| | Amount |
|--|--------|
| **Gross Revenue (Year 2)** | **$105,000-$130,000** |
| App Store cut (15% on renewals, 30% on new) | ~-$22,000 |
| **Net Revenue (Year 2)** | **$83,000-$108,000** |

### Optimistic Scenario (Year 3+)

With venue partnerships, established brand, and international festival expansion:

| Metric | Value |
|--------|-------|
| Active paid subscribers | 6,000-8,000 |
| Annual subscriber share | 50%+ |
| **Gross Revenue** | **$250,000-$400,000** |
| **Net Revenue (after store cut)** | **$200,000-$340,000** |

### Revenue Sensitivity

The single biggest lever is **summer-to-annual conversion rate.** If 40% of summer pass holders convert to annual (vs the baseline 30%), Year 2 net revenue increases by approximately $15,000-$20,000. Every dollar spent on the July conversion flow has outsized returns.

---

## Appendix: Implementation Priority

### Phase 1 (Pre-Launch / MVP)

- Free tier with 5-event cap
- Pro tier (single paid tier to start)
- 14-day free trial
- Annual and monthly billing only
- Basic paywall UI

### Phase 2 (WSOP Summer 2026)

- Summer Pass option
- Referral program
- In-app conversion nudges
- Smart alerts and live updates

### Phase 3 (Post-Summer 2026)

- Pro+ tier launch (once table scanner and staking tools are ready)
- Group/crew discounts
- Venue partnership integrations
- Tax-ready report generation

### Phase 4 (Year 2)

- Early-bird pricing automation
- Advanced analytics
- International festival expansion
- Loyalty/returning user pricing

---

## Appendix: Pricing Benchmark Sources

- PokerTracker 4 / Holdem Manager 3: $60-$160 (one-time or annual)
- Hand2Note 3: $20-$61/month
- SharkScope: $6-$26/month
- PokerGO: $19.99/month or $99.99/year
- Poker Bankroll Tracker: ~$25/year
- Nash Bankroll: $3.99/month or $29.99/year
- HendonMob: Free
- PokerAtlas: Freemium (PRO pricing not publicly listed)
- 2025 WSOP: 246,960 total entries, 100 bracelet events, $481.7M in prizes
