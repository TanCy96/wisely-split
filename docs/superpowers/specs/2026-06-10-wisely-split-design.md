# wisely-split — Design Spec

**Date:** 2026-06-10
**Status:** Approved pending user review

## Purpose

A Splitwise-style expense-splitting app for real use by a friend group: track shared
expenses in groups, split them equally or unequally, see who owes whom, record
settle-up payments, and suggest the minimum set of payments to settle all debts.

Not a commercial product. Optimized for reliability and low friction over feature
breadth. Single currency per group. No receipts/photos, no multi-currency, no
activity feed.

## Stack

Identical to smash-kaki: Next.js 15 (App Router) + React 19 + TypeScript +
Supabase (auth, Postgres, RLS) + Tailwind 4 + Zod + Vitest, deployed on Vercel
(Hobby) with a **separate, dedicated Supabase free-tier project** (the second of
the two free active project slots).

Same-account-across-sites was considered and rejected: auth cookies are
per-domain so a shared Supabase project gives no real UX benefit, while costing
isolation (shared tables, RLS interference risk, shared quotas). Users simply
register on this site with the same email if they like.

## Core architectural decision: pure ledger, compute on read

Balances are **never stored**. The database holds only the ledger (`expenses` +
`expense_shares`); net balances and settle-up suggestions are computed from
fetched rows at render time. For group-scale data (tens to hundreds of
expenses) this is microseconds of work and eliminates the worst failure mode —
stored balances drifting from the ledger. Edits and deletes need no
recalculation logic.

Rejected alternatives: materialized balance table maintained by triggers
(consistency risk, unjustified at this scale); full double-entry journal
(overkill).

## Membership model: hybrid placeholders

Group members are rows with a `display_name` and a nullable `user_id`:

- A member with `user_id = NULL` is a **placeholder** — just a name the
  bookkeeper added. Placeholders can be assigned expenses like anyone else.
- The group's invite link (`/g/[inviteToken]`) shows the group and lets a
  visitor sign up (or log in) and **claim** a placeholder, setting `user_id` on
  that member row — or join as a brand-new member.
- All expense references point at `group_members.id`, never `auth.users`, so
  claiming is free: history follows the member row.

## Schema (4 tables, all money in integer cents)

```sql
groups
  id            uuid pk default gen_random_uuid()
  name          text not null
  currency_code text not null default 'SGD'   -- display only
  invite_token  text not null unique          -- nanoid(22)
  created_by    uuid not null references auth.users
  created_at    timestamptz not null default now()

group_members
  id            uuid pk default gen_random_uuid()
  group_id      uuid not null references groups on delete cascade
  display_name  text not null
  user_id       uuid null references auth.users   -- NULL = placeholder
  created_at    timestamptz not null default now()
  unique (group_id, user_id)                  -- a user claims at most one member per group

expenses
  id            uuid pk default gen_random_uuid()
  group_id      uuid not null references groups on delete cascade
  description   text not null
  amount_cents  integer not null check (amount_cents > 0)
  paid_by       uuid not null references group_members
  split_method  text not null check (split_method in ('equal','exact','percent','shares'))
  is_settlement boolean not null default false
  expense_date  date not null
  created_by    uuid not null references auth.users
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()

expense_shares
  id            uuid pk default gen_random_uuid()
  expense_id    uuid not null references expenses on delete cascade
  member_id     uuid not null references group_members
  share_cents   integer not null check (share_cents >= 0)
  split_value   numeric null    -- raw user input (the "2" in 2 shares, "25" in 25%) for edit-form redisplay
  unique (expense_id, member_id)
```

Invariant (enforced in app code, asserted in tests): for every expense,
`sum(expense_shares.share_cents) = expenses.amount_cents`.

A **settle-up payment** is an expense with `is_settlement = true`, `paid_by` =
the payer, and exactly one share for the payee. No separate payments table.

Migrations are SQL files in `supabase/migrations/`, applied manually in the
Supabase dashboard SQL editor (same workflow as smash-kaki).

## The engine — `src/lib`, pure functions, fully unit-tested

- **`splits.ts`** — converts user input into exact per-member cents:
  - `equal`: amount divided by N; remainder cents (amount mod N) distributed
    deterministically to the first N-mod members by position order.
  - `exact`: amounts entered directly; must sum to the total (validation error
    otherwise).
  - `percent`: percentages must sum to 100; converted to cents, remainder
    distributed as in `equal`.
  - `shares`: weight per member; converted proportionally, remainder
    distributed as in `equal`.
  - Highest-test-value code in the app: rounding edge cases, 1-cent totals,
    single-member splits, remainder determinism.
- **`balances.ts`** — net per member = total paid − total owed across all
  expenses (settlements included; they're just expenses). Test invariant: nets
  always sum to zero.
- **`simplify.ts`** — greedy min-transfers algorithm over net balances: match
  largest debtor against largest creditor, emit a suggested payment, repeat.
  Output is display-layer only ("suggested settle-ups"); the ledger remains the
  sole source of truth.

All three modules take plain data in and return plain data out — no Supabase
imports — so they test without mocks.

## Routes

- `src/app/(auth)/` — login, register, forgot-password, update-password +
  `auth/callback` — **copied verbatim from smash-kaki** with their tests.
- `/` — dashboard: list of groups the signed-in user belongs to; create group.
- `/groups/[id]` — group detail: net balances per member, suggested
  settle-ups, expense list, add expense, record payment, copy invite link.
- `/groups/[id]/expenses/[expenseId]` — edit/delete an expense.
- `/g/[inviteToken]` — join page (works anonymously via token): shows group
  name and member names, prompts to sign up / log in, then claim a placeholder
  or join as a new member.
- `/api/cron/backup` — keepalive + backup handler (below).

Data access goes through a `src/lib/db.ts` query layer (smash-kaki pattern).
Mutations are Server Actions validated with Zod.

## Keepalive + backup cron (two birds, one stone)

A single daily Vercel cron job both backs up the data **and** keeps the
free-tier Supabase project from pausing (the export query counts as database
activity, and free projects pause after ~7 days without any).

- `vercel.json` defines one cron: daily request to `/api/cron/backup`.
- The handler verifies `Authorization: Bearer ${CRON_SECRET}` (sent
  automatically by Vercel), reads all four tables with the **service-role
  key** (bypassing RLS), serializes to a single JSON snapshot, and commits it
  to a **private GitHub backup repo** via the GitHub contents API.
- Requires two env vars: `CRON_SECRET` and a fine-grained GitHub PAT scoped to
  the one backup repo (`GITHUB_BACKUP_TOKEN`), plus the repo name.
- This is a *logical* backup (data only). Schema restoration comes from the
  migration SQL files in the app repo; together they fully reconstruct the
  project. Restore = run migrations, insert JSON rows.
- GitHub chosen over alternatives: free, versioned history with diffs,
  trivially restorable. (Email-to-self and Supabase Storage were considered;
  the latter rejected because a backup inside the project it backs up doesn't
  protect against project loss.)

## Security / RLS

- `groups`, `group_members`, `expenses`, `expense_shares`: members can read
  and write only rows belonging to groups where a `group_members` row carries
  their `user_id`.
- Invite-token access (anonymous join page) is served by server-side queries
  keyed on the token — same pattern as smash-kaki's guest routes; the token
  (nanoid 22) is the capability.
- Claiming a placeholder (and joining as a new member) happens *before* the
  user satisfies the membership RLS policy, so it runs in a Server Action that
  validates the invite token server-side and performs the
  `group_members` insert/update with elevated rights — the token, not RLS, is
  the authorization for this one operation.
- Service-role key is used only in the cron route, never shipped to the client.

## Reuse from smash-kaki

Copied wholesale (with tests): `(auth)` route group, `auth/callback`,
`supabase-auth.ts`, `auth-errors.ts`, `safe-redirect.ts`, `tokens.ts`,
`src/components/ui/*` (Button, Card, Field, Alert, Badge, PageShell,
SectionHeading, StatRow), `CopyLinkButton`, `AuthNav`, Tailwind theme, and the
project scaffolding (package.json, tsconfig, eslint, vitest config).

Reused as a pattern, not code: `db.ts` query-layer style, invite-token routes,
migrations workflow. Explicitly **not** reused: `cost.ts` (float-based; the new
split engine works in integer cents and is written fresh).

## Known free-tier constraints & mitigations

| Constraint | Mitigation |
|---|---|
| Supabase pauses after ~7 idle days | Daily backup cron doubles as keepalive |
| No automatic backups on free tier | Same cron commits JSON snapshots to GitHub |
| Built-in auth email rate limits (~few/hour) | Small group, rare signups; if it bites, wire Resend SMTP or disable email confirmation (invite-gated app) |
| Vercel Hobby cold starts | Accepted (cosmetic) |
| Cross-region latency | Create Supabase project in the same region as Vercel functions (Singapore) |
| Auth redirect URLs on deploy | Set Site URL + redirect allowlist in Supabase for the production domain (known gotcha from smash-kaki) |

## Testing

- Vitest unit tests for `splits.ts`, `balances.ts`, `simplify.ts` — rounding
  edge cases, zero-sum invariant, simplification correctness, settlement
  round-trips (record suggested payments → all balances reach zero).
- Auth and UI components arrive with their existing smash-kaki tests.
- Server Actions validated with Zod; invalid splits (shares not summing to
  total, percents ≠ 100) rejected before reaching the DB.

## Out of scope (YAGNI)

Multi-currency, receipts/photos, activity feed, notifications, friend
relationships outside groups, expense categories, recurring expenses, CSV
export UI (the backup JSON covers data portability).
