# wisely-split Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the wisely-split project: scaffolding and auth copied from smash-kaki, the database schema migration, and the fully unit-tested split/balance/simplify engine.

**Architecture:** Next.js 15 App Router app backed by a dedicated Supabase project. Pure-ledger design: the DB stores only `expenses` + `expense_shares`; balances are computed at render time by pure functions in `src/lib` (no Supabase imports, tested without mocks). Auth pages, lib utilities, and UI primitives are copied from `D:\Projects\smash-kaki`.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase (`@supabase/ssr`), Tailwind 4, Zod 4, Vitest 4, nanoid.

**Scope:** This is Phase 1 of 3. Phase 2 (groups/expenses routes + `db.ts` query layer + invite/claim flow) and Phase 3 (backup/keepalive cron) get their own plans once this foundation is merged.

**Spec:** `docs/superpowers/specs/2026-06-10-wisely-split-design.md`

**Prerequisites:**
- `D:\Projects\smash-kaki` must exist locally (source of copied files).
- All commands run from `D:\Projects\wisely-split` in PowerShell.
- Node.js + npm installed.

---

### Task 1: Project scaffolding + app shell

**Files:**
- Create: `package.json` (written fresh — renamed copy of smash-kaki's)
- Copy: `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `next.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.local.example` from `D:\Projects\smash-kaki\`
- Copy: `src/app/globals.css` from smash-kaki
- Create: `src/app/layout.tsx` (smash-kaki's with new metadata)
- Create: `src/app/page.tsx` (placeholder home, replaced in Phase 2)

- [ ] **Step 1: Copy config files from smash-kaki**

```powershell
Copy-Item D:\Projects\smash-kaki\tsconfig.json, D:\Projects\smash-kaki\eslint.config.mjs, D:\Projects\smash-kaki\vitest.config.ts, D:\Projects\smash-kaki\next.config.ts, D:\Projects\smash-kaki\postcss.config.mjs, D:\Projects\smash-kaki\.gitignore, D:\Projects\smash-kaki\.env.local.example -Destination D:\Projects\wisely-split\
New-Item -ItemType Directory -Force D:\Projects\wisely-split\src\app
Copy-Item D:\Projects\smash-kaki\src\app\globals.css D:\Projects\wisely-split\src\app\globals.css
```

- [ ] **Step 2: Write `package.json`**

Identical to smash-kaki's except `"name"`:

```json
{
  "name": "wisely-split",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/ssr": "^0.10.3",
    "@supabase/supabase-js": "^2.107.0",
    "nanoid": "^5.1.11",
    "next": "^15.5.19",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^6.0.2",
    "eslint": "^9",
    "eslint-config-next": "^15.5.19",
    "jsdom": "^29.1.1",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 3: Write `src/app/layout.tsx`**

smash-kaki's layout with wisely-split metadata:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "wisely-split",
  description: "Track shared expenses, split them fairly, settle up simply.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Write placeholder `src/app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">wisely-split</h1>
      <p className="mt-2 text-muted">Dashboard coming in Phase 2.</p>
    </main>
  );
}
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: completes without errors; `package-lock.json` created.

- [ ] **Step 6: Verify test runner and build**

Run: `npm test`
Expected: PASS — "No test files found" is fine (`passWithNoTests: true`).

Run: `npm run build`
Expected: build succeeds (no env vars needed yet — nothing imports Supabase).

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "chore: scaffold project from smash-kaki configs"
```

---

### Task 2: Copy lib utilities with their tests

**Files:**
- Copy: `src/lib/auth-errors.ts`, `src/lib/auth-errors.test.ts`
- Copy: `src/lib/safe-redirect.ts`, `src/lib/safe-redirect.test.ts`
- Copy: `src/lib/tokens.ts`, `src/lib/tokens.test.ts`
- Copy + 1 rename: `src/lib/supabase-auth.ts`

- [ ] **Step 1: Copy the files**

```powershell
New-Item -ItemType Directory -Force D:\Projects\wisely-split\src\lib
Copy-Item D:\Projects\smash-kaki\src\lib\auth-errors.ts, D:\Projects\smash-kaki\src\lib\auth-errors.test.ts, D:\Projects\smash-kaki\src\lib\safe-redirect.ts, D:\Projects\smash-kaki\src\lib\safe-redirect.test.ts, D:\Projects\smash-kaki\src\lib\tokens.ts, D:\Projects\smash-kaki\src\lib\tokens.test.ts, D:\Projects\smash-kaki\src\lib\supabase-auth.ts -Destination D:\Projects\wisely-split\src\lib\
```

Do **not** copy `db.ts`/`db.test.ts` — smash-kaki's is domain-specific; wisely-split gets a fresh one in Phase 2.

- [ ] **Step 2: Rename `currentPlayerId` → `currentUserId` in `src/lib/supabase-auth.ts`**

The only change to any copied file — smash-kaki's domain name doesn't fit here. In `src/lib/supabase-auth.ts`, the last function becomes:

```ts
export async function currentUserId(): Promise<string | null> {
  const supabase = await serverAuth();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
```

Nothing copied in later tasks references the old name (verified: auth pages call Server Actions, the callback route uses only `serverAuth`, and `AuthNav` is rewritten in Task 4).

- [ ] **Step 3: Run the copied tests**

Run: `npm test`
Expected: PASS — `auth-errors.test.ts`, `safe-redirect.test.ts`, `tokens.test.ts` all green.

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "feat: copy auth/lib utilities from smash-kaki"
```

---

### Task 3: Copy UI components

**Files:**
- Copy: everything in `src/components/ui/` (Button, Card, Field, Alert, Badge, PageShell, SectionHeading, StatRow, index.ts)
- Copy: `src/components/CopyLinkButton.tsx`

(smash-kaki has no component tests; none expected.)

- [ ] **Step 1: Copy the components**

```powershell
New-Item -ItemType Directory -Force D:\Projects\wisely-split\src\components
Copy-Item -Recurse D:\Projects\smash-kaki\src\components\ui D:\Projects\wisely-split\src\components\ui
Copy-Item D:\Projects\smash-kaki\src\components\CopyLinkButton.tsx D:\Projects\wisely-split\src\components\
```

Do **not** copy `AuthNav.tsx` — it imports smash-kaki's `getProfile`/`db.ts`; Task 4 writes an adapted version.

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```powershell
git add -A
git commit -m "feat: copy UI component library from smash-kaki"
```

---

### Task 4: Auth routes, actions, and AuthNav

**Files:**
- Create: `src/app/actions.ts` (auth Server Actions only — `registerAction` adapted, rest verbatim from smash-kaki's `actions.ts`)
- Copy: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/app/(auth)/forgot-password/page.tsx`, `src/app/(auth)/update-password/page.tsx`
- Copy: `src/app/auth/callback/route.ts`
- Create: `src/components/AuthNav.tsx` (adapted — no profiles table)
- Modify: `src/app/page.tsx` (mount AuthNav so login state is visible)

**Key adaptation:** smash-kaki's `registerAction` inserts into a `profiles` table. wisely-split has exactly 4 tables (spec) and no profiles — `display_name` is stored in Supabase auth **user metadata** instead, and `AuthNav` reads it from `user.user_metadata`.

- [ ] **Step 1: Copy the auth pages and callback route**

```powershell
Copy-Item -Recurse "D:\Projects\smash-kaki\src\app\(auth)" "D:\Projects\wisely-split\src\app\(auth)"
New-Item -ItemType Directory -Force D:\Projects\wisely-split\src\app\auth\callback
Copy-Item D:\Projects\smash-kaki\src\app\auth\callback\route.ts D:\Projects\wisely-split\src\app\auth\callback\route.ts
```

- [ ] **Step 2: Write `src/app/actions.ts`**

`loginAction`, `logoutAction`, `forgotPasswordAction`, `updatePasswordAction` are verbatim from smash-kaki; `registerAction` swaps the profiles insert for signUp metadata:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authErrorMessage, authErrorRedirectPath } from "@/lib/auth-errors";
import { serverAuth } from "@/lib/supabase-auth";

export async function registerAction(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const displayName = String(formData.get("display_name"));
  const supabase = await serverAuth();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) {
    redirect(authErrorRedirectPath("/register", authErrorMessage(error)));
  }

  revalidatePath("/");
  redirect("/");
}

export async function loginAction(formData: FormData) {
  const supabase = await serverAuth();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) {
    redirect(authErrorRedirectPath("/login", authErrorMessage(error)));
  }

  revalidatePath("/");
  redirect("/");
}

export async function logoutAction() {
  const supabase = await serverAuth();
  await supabase.auth.signOut();

  revalidatePath("/");
  redirect("/");
}

export async function forgotPasswordAction(formData: FormData) {
  const supabase = await serverAuth();
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  const { error } = await supabase.auth.resetPasswordForEmail(
    String(formData.get("email")),
    {
      redirectTo: `${base}/auth/callback?next=/update-password`,
    }
  );
  if (error) {
    redirect(authErrorRedirectPath("/forgot-password", authErrorMessage(error)));
  }

  redirect("/login?reset=sent");
}

const updatePasswordSchema = z.object({
  password: z.string().min(6),
});

export async function updatePasswordAction(formData: FormData) {
  const parsed = updatePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      authErrorRedirectPath(
        "/update-password",
        "Password must be at least 6 characters."
      )
    );
  }

  const supabase = await serverAuth();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    redirect(authErrorRedirectPath("/update-password", authErrorMessage(error)));
  }

  revalidatePath("/");
  redirect("/");
}
```

- [ ] **Step 3: Write `src/components/AuthNav.tsx`**

Adapted from smash-kaki: display name comes from auth user metadata, and the smash-kaki-specific "My sessions" link is dropped:

```tsx
import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui";
import { serverAuth } from "@/lib/supabase-auth";

/**
 * Header auth controls: a log-out form when signed in, otherwise log in /
 * register links. Display name lives in auth user metadata (set at sign-up);
 * there is no profiles table.
 */
export async function AuthNav() {
  const supabase = await serverAuth();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (user) {
    const displayName =
      typeof user.user_metadata?.display_name === "string"
        ? user.user_metadata.display_name
        : "";
    return (
      <form action={logoutAction} className="flex items-center gap-3 text-sm">
        <span className="max-w-32 truncate font-medium text-muted">
          {displayName || "Signed in"}
        </span>
        <Button variant="ghost" className="px-2 py-1">
          Log out
        </Button>
      </form>
    );
  }

  return (
    <div className="flex gap-2 text-sm font-semibold">
      <Link href="/login" className="text-primary hover:underline">
        Log in
      </Link>
      <Link href="/register" className="text-primary hover:underline">
        Register
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Mount AuthNav on the placeholder home page**

Replace `src/app/page.tsx` with:

```tsx
import { AuthNav } from "@/components/AuthNav";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">wisely-split</h1>
        <AuthNav />
      </div>
      <p className="mt-2 text-muted">Dashboard coming in Phase 2.</p>
    </main>
  );
}
```

- [ ] **Step 5: Verify build and tests**

Run: `npm run build`
Expected: build succeeds. (Supabase env vars are only read at request time, not build time.)

Run: `npm test`
Expected: PASS — same 3 test files as Task 2.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "feat: auth pages, actions, and AuthNav (display name in user metadata)"
```

---

### Task 5: Database schema migration

**Files:**
- Create: `supabase/migrations/2026-06-10-initial-schema.sql`

Applied manually in the Supabase dashboard SQL editor (Task 6) — same workflow as smash-kaki.

- [ ] **Step 1: Write the migration**

```sql
-- wisely-split initial schema: pure ledger, all money in integer cents.
-- groups / group_members / expenses / expense_shares — no stored balances.

create table groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  currency_code text not null default 'SGD',   -- display only
  invite_token  text not null unique,          -- nanoid(22), generated in app code
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now()
);

-- A member row with user_id = NULL is a placeholder (just a name). Postgres
-- unique treats NULLs as distinct, so one group can hold many placeholders
-- while a real user can claim at most one member row per group.
create table group_members (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references groups (id) on delete cascade,
  display_name  text not null,
  user_id       uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  unique (group_id, user_id)
);

-- A settle-up payment is an expense with is_settlement = true and exactly one
-- share (the payee). No separate payments table.
create table expenses (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references groups (id) on delete cascade,
  description   text not null,
  amount_cents  integer not null check (amount_cents > 0),
  paid_by       uuid not null references group_members (id),
  split_method  text not null check (split_method in ('equal', 'exact', 'percent', 'shares')),
  is_settlement boolean not null default false,
  expense_date  date not null,
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table expense_shares (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references expenses (id) on delete cascade,
  member_id   uuid not null references group_members (id),
  share_cents integer not null check (share_cents >= 0),
  split_value numeric,   -- raw user input ("2" in 2 shares, "25" in 25%) for edit-form redisplay
  unique (expense_id, member_id)
);

create index group_members_group_id_idx on group_members (group_id);
create index group_members_user_id_idx on group_members (user_id);
create index expenses_group_id_idx on expenses (group_id);
create index expense_shares_expense_id_idx on expense_shares (expense_id);
create index expense_shares_member_id_idx on expense_shares (member_id);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger expenses_updated_at
  before update on expenses
  for each row execute function set_updated_at();

-- RLS: members can read and write only rows of groups they belong to.
-- security definer dodges the self-referential policy recursion on
-- group_members (a policy on group_members cannot itself query group_members
-- through RLS).
create or replace function is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

alter table groups enable row level security;
alter table group_members enable row level security;
alter table expenses enable row level security;
alter table expense_shares enable row level security;

create policy "members read groups" on groups
  for select using (is_group_member(id));
create policy "users create groups" on groups
  for insert with check (created_by = auth.uid());
create policy "members update groups" on groups
  for update using (is_group_member(id));
create policy "members delete groups" on groups
  for delete using (is_group_member(id));

create policy "members read members" on group_members
  for select using (is_group_member(group_id));
-- The group creator may insert members before being a member themselves
-- (bootstrapping their own member row right after creating the group).
create policy "members insert members" on group_members
  for insert with check (
    is_group_member(group_id)
    or auth.uid() = (select created_by from groups where id = group_id)
  );
create policy "members update members" on group_members
  for update using (is_group_member(group_id));
create policy "members delete members" on group_members
  for delete using (is_group_member(group_id));

create policy "members read expenses" on expenses
  for select using (is_group_member(group_id));
create policy "members insert expenses" on expenses
  for insert with check (is_group_member(group_id) and created_by = auth.uid());
create policy "members update expenses" on expenses
  for update using (is_group_member(group_id));
create policy "members delete expenses" on expenses
  for delete using (is_group_member(group_id));

create policy "members read shares" on expense_shares
  for select using (
    exists (
      select 1 from expenses e
      where e.id = expense_id and is_group_member(e.group_id)
    )
  );
create policy "members insert shares" on expense_shares
  for insert with check (
    exists (
      select 1 from expenses e
      where e.id = expense_id and is_group_member(e.group_id)
    )
  );
create policy "members update shares" on expense_shares
  for update using (
    exists (
      select 1 from expenses e
      where e.id = expense_id and is_group_member(e.group_id)
    )
  );
create policy "members delete shares" on expense_shares
  for delete using (
    exists (
      select 1 from expenses e
      where e.id = expense_id and is_group_member(e.group_id)
    )
  );
```

Note: anonymous invite-page reads and the claim/join flow (Phase 2) run through
server-side code where the invite token is the capability — they do not rely on
these policies.

- [ ] **Step 2: Commit**

```powershell
git add supabase/migrations/2026-06-10-initial-schema.sql
git commit -m "feat: initial schema migration with RLS"
```

---

### Task 6: Supabase project setup (MANUAL — needs the user)

No code. Can happen in parallel with Tasks 7–9; only the Task 10 smoke test depends on it. If executing agentically, pause and hand this checklist to the user:

- [ ] **Step 1: Create the Supabase project**
  - At https://supabase.com/dashboard: New project, name `wisely-split`, region **Southeast Asia (Singapore)** (matches Vercel functions region per spec), generate a strong DB password and store it in your password manager.
  - This uses the second of the two free-tier active project slots (smash-kaki holds the first).

- [ ] **Step 2: Run the migration**
  - Dashboard → SQL Editor → paste the full contents of `supabase/migrations/2026-06-10-initial-schema.sql` → Run.
  - Expected: "Success. No rows returned". Verify the 4 tables appear under Table Editor.

- [ ] **Step 3: Auth settings**
  - Authentication → Sign In / Up → Email: **disable "Confirm email"** (spec mitigation: invite-gated app, avoids the free-tier email rate limit; also required for `registerAction`'s immediate redirect to work).
  - Authentication → URL Configuration: Site URL `http://localhost:3000` for now (production URL added at deploy time — known smash-kaki gotcha, listed in the spec's constraints table).

- [ ] **Step 4: Create `.env.local`**
  - Copy `.env.local.example` → `.env.local`; fill from Project Settings → API:
    - `NEXT_PUBLIC_SUPABASE_URL` — project URL
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon/publishable key
    - `SUPABASE_SERVICE_ROLE_KEY` — service role key (server-only; used by the Phase 3 cron)
    - `NEXT_PUBLIC_BASE_URL` — `http://localhost:3000`

---

### Task 7: Split engine — `src/lib/splits.ts` (TDD)

**Files:**
- Create: `src/lib/splits.ts`
- Test: `src/lib/splits.test.ts`

Pure function: user input in, exact per-member cents out. No Supabase imports. The highest-test-value code in the app.

**API (used by every later task and by Phase 2 Server Actions):**

```ts
export type SplitMethod = "equal" | "exact" | "percent" | "shares";

export type SplitParticipant = {
  memberId: string;
  /** Raw input: null for "equal"; cents for "exact"; percentage for "percent"; weight for "shares". */
  value: number | null;
};

export type ComputedShare = {
  memberId: string;
  shareCents: number;
  /** Echo of the raw input, persisted to expense_shares.split_value for edit-form redisplay. */
  splitValue: number | null;
};

export class SplitError extends Error {}

export function computeShares(
  method: SplitMethod,
  amountCents: number,
  participants: SplitParticipant[]
): ComputedShare[];
```

- [ ] **Step 1: Write failing tests for validation + equal split**

Create `src/lib/splits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeShares, SplitError } from "./splits";

describe("computeShares — validation", () => {
  it("rejects a zero amount", () => {
    expect(() =>
      computeShares("equal", 0, [{ memberId: "a", value: null }])
    ).toThrow(SplitError);
  });

  it("rejects a non-integer amount", () => {
    expect(() =>
      computeShares("equal", 10.5, [{ memberId: "a", value: null }])
    ).toThrow(SplitError);
  });

  it("rejects an empty participant list", () => {
    expect(() => computeShares("equal", 100, [])).toThrow(SplitError);
  });

  it("rejects duplicate members", () => {
    expect(() =>
      computeShares("equal", 100, [
        { memberId: "a", value: null },
        { memberId: "a", value: null },
      ])
    ).toThrow(SplitError);
  });
});

describe("computeShares — equal", () => {
  it("splits evenly when divisible", () => {
    const result = computeShares("equal", 3000, [
      { memberId: "a", value: null },
      { memberId: "b", value: null },
      { memberId: "c", value: null },
    ]);
    expect(result).toEqual([
      { memberId: "a", shareCents: 1000, splitValue: null },
      { memberId: "b", shareCents: 1000, splitValue: null },
      { memberId: "c", shareCents: 1000, splitValue: null },
    ]);
  });

  it("gives remainder cents to the first members by position order", () => {
    const result = computeShares("equal", 100, [
      { memberId: "a", value: null },
      { memberId: "b", value: null },
      { memberId: "c", value: null },
    ]);
    expect(result.map((s) => s.shareCents)).toEqual([34, 33, 33]);
  });

  it("handles a 1-cent total", () => {
    const result = computeShares("equal", 1, [
      { memberId: "a", value: null },
      { memberId: "b", value: null },
    ]);
    expect(result.map((s) => s.shareCents)).toEqual([1, 0]);
  });

  it("gives a single member everything", () => {
    const result = computeShares("equal", 999, [{ memberId: "solo", value: null }]);
    expect(result).toEqual([{ memberId: "solo", shareCents: 999, splitValue: null }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module './splits'` (or equivalent).

- [ ] **Step 3: Implement validation + equal**

Create `src/lib/splits.ts` (exact/percent/shares stubbed, implemented in the next cycles):

```ts
export type SplitMethod = "equal" | "exact" | "percent" | "shares";

export type SplitParticipant = {
  memberId: string;
  /** Raw input: null for "equal"; cents for "exact"; percentage for "percent"; weight for "shares". */
  value: number | null;
};

export type ComputedShare = {
  memberId: string;
  shareCents: number;
  /** Echo of the raw input, persisted to expense_shares.split_value for edit-form redisplay. */
  splitValue: number | null;
};

export class SplitError extends Error {}

export function computeShares(
  method: SplitMethod,
  amountCents: number,
  participants: SplitParticipant[]
): ComputedShare[] {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new SplitError("Amount must be a positive whole number of cents.");
  }
  if (participants.length === 0) {
    throw new SplitError("At least one participant is required.");
  }
  const ids = new Set(participants.map((p) => p.memberId));
  if (ids.size !== participants.length) {
    throw new SplitError("Participants must be unique.");
  }

  switch (method) {
    case "equal":
      return splitEqual(amountCents, participants);
    case "exact":
      throw new SplitError("not implemented");
    case "percent":
      throw new SplitError("not implemented");
    case "shares":
      throw new SplitError("not implemented");
  }
}

function splitEqual(
  amountCents: number,
  participants: SplitParticipant[]
): ComputedShare[] {
  const n = participants.length;
  const base = Math.floor(amountCents / n);
  const remainder = amountCents % n;
  return participants.map((p, i) => ({
    memberId: p.memberId,
    shareCents: base + (i < remainder ? 1 : 0),
    splitValue: null,
  }));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/splits.ts src/lib/splits.test.ts
git commit -m "feat: split engine — equal split with deterministic remainder"
```

- [ ] **Step 6: Write failing tests for exact split**

Append to `src/lib/splits.test.ts`:

```ts
describe("computeShares — exact", () => {
  it("uses the entered cents and echoes splitValue", () => {
    const result = computeShares("exact", 5000, [
      { memberId: "a", value: 1250 },
      { memberId: "b", value: 3750 },
    ]);
    expect(result).toEqual([
      { memberId: "a", shareCents: 1250, splitValue: 1250 },
      { memberId: "b", shareCents: 3750, splitValue: 3750 },
    ]);
  });

  it("allows a zero share", () => {
    const result = computeShares("exact", 100, [
      { memberId: "a", value: 100 },
      { memberId: "b", value: 0 },
    ]);
    expect(result.map((s) => s.shareCents)).toEqual([100, 0]);
  });

  it("rejects amounts that do not sum to the total", () => {
    expect(() =>
      computeShares("exact", 5000, [
        { memberId: "a", value: 1250 },
        { memberId: "b", value: 3000 },
      ])
    ).toThrow(SplitError);
  });

  it("rejects missing, negative, or fractional cents", () => {
    expect(() =>
      computeShares("exact", 100, [{ memberId: "a", value: null }])
    ).toThrow(SplitError);
    expect(() =>
      computeShares("exact", 100, [
        { memberId: "a", value: 150 },
        { memberId: "b", value: -50 },
      ])
    ).toThrow(SplitError);
    expect(() =>
      computeShares("exact", 100, [
        { memberId: "a", value: 50.5 },
        { memberId: "b", value: 49.5 },
      ])
    ).toThrow(SplitError);
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `npm test`
Expected: FAIL — the new `exact` tests throw `SplitError("not implemented")` where success was expected (the rejection tests pass for the wrong reason; that's fine, the success tests drive the implementation).

- [ ] **Step 8: Implement exact**

In `src/lib/splits.ts`, replace `case "exact": throw new SplitError("not implemented");` with `case "exact": return splitExact(amountCents, participants);` and add:

```ts
function splitExact(
  amountCents: number,
  participants: SplitParticipant[]
): ComputedShare[] {
  for (const p of participants) {
    if (p.value === null || !Number.isInteger(p.value) || p.value < 0) {
      throw new SplitError(
        "Each exact amount must be a whole number of cents (0 or more)."
      );
    }
  }
  const sum = participants.reduce((acc, p) => acc + (p.value as number), 0);
  if (sum !== amountCents) {
    throw new SplitError(
      `Exact amounts must add up to the total (got ${sum}, expected ${amountCents}).`
    );
  }
  return participants.map((p) => ({
    memberId: p.memberId,
    shareCents: p.value as number,
    splitValue: p.value,
  }));
}
```

- [ ] **Step 9: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add src/lib/splits.ts src/lib/splits.test.ts
git commit -m "feat: split engine — exact split with sum validation"
```

- [ ] **Step 11: Write failing tests for percent and shares splits**

Append to `src/lib/splits.test.ts`:

```ts
describe("computeShares — percent", () => {
  it("converts percentages to cents", () => {
    const result = computeShares("percent", 8000, [
      { memberId: "a", value: 25 },
      { memberId: "b", value: 75 },
    ]);
    expect(result).toEqual([
      { memberId: "a", shareCents: 2000, splitValue: 25 },
      { memberId: "b", shareCents: 6000, splitValue: 75 },
    ]);
  });

  it("distributes the rounding remainder to the first members by position order", () => {
    const result = computeShares("percent", 100, [
      { memberId: "a", value: 33.33 },
      { memberId: "b", value: 33.33 },
      { memberId: "c", value: 33.34 },
    ]);
    expect(result.map((s) => s.shareCents)).toEqual([34, 33, 33]);
    expect(result.reduce((acc, s) => acc + s.shareCents, 0)).toBe(100);
  });

  it("rejects percentages that do not sum to 100", () => {
    expect(() =>
      computeShares("percent", 100, [
        { memberId: "a", value: 50 },
        { memberId: "b", value: 49 },
      ])
    ).toThrow(SplitError);
  });

  it("rejects missing or negative percentages", () => {
    expect(() =>
      computeShares("percent", 100, [
        { memberId: "a", value: null },
        { memberId: "b", value: 100 },
      ])
    ).toThrow(SplitError);
    expect(() =>
      computeShares("percent", 100, [
        { memberId: "a", value: 150 },
        { memberId: "b", value: -50 },
      ])
    ).toThrow(SplitError);
  });
});

describe("computeShares — shares", () => {
  it("splits proportionally by weight with remainder to the first members", () => {
    const result = computeShares("shares", 100, [
      { memberId: "a", value: 2 },
      { memberId: "b", value: 1 },
    ]);
    // 100 × 2/3 = 66.67 → 66; 100 × 1/3 = 33.33 → 33; remainder 1 → first member
    expect(result).toEqual([
      { memberId: "a", shareCents: 67, splitValue: 2 },
      { memberId: "b", shareCents: 33, splitValue: 1 },
    ]);
  });

  it("allows a zero weight (member owes nothing)", () => {
    const result = computeShares("shares", 100, [
      { memberId: "a", value: 1 },
      { memberId: "b", value: 0 },
    ]);
    expect(result.map((s) => s.shareCents)).toEqual([100, 0]);
  });

  it("rejects all-zero weights", () => {
    expect(() =>
      computeShares("shares", 100, [
        { memberId: "a", value: 0 },
        { memberId: "b", value: 0 },
      ])
    ).toThrow(SplitError);
  });
});

describe("computeShares — sum invariant", () => {
  it("shares always sum exactly to the amount", () => {
    const members = (n: number) =>
      Array.from({ length: n }, (_, i) => `m${i + 1}`);
    for (let amount = 1; amount <= 250; amount++) {
      for (let n = 1; n <= 5; n++) {
        const equal = computeShares(
          "equal",
          amount,
          members(n).map((id) => ({ memberId: id, value: null }))
        );
        expect(equal.reduce((acc, s) => acc + s.shareCents, 0)).toBe(amount);

        const weighted = computeShares(
          "shares",
          amount,
          members(n).map((id, i) => ({ memberId: id, value: i + 1 }))
        );
        expect(weighted.reduce((acc, s) => acc + s.shareCents, 0)).toBe(amount);
      }
    }
  });
});
```

- [ ] **Step 12: Run to verify failure**

Run: `npm test`
Expected: FAIL — percent/shares success cases hit `SplitError("not implemented")`.

- [ ] **Step 13: Implement percent and shares**

Both reduce to proportional distribution (percent divides by the ~100 total; shares by total weight). In `src/lib/splits.ts`, replace the two remaining stub cases with:

```ts
    case "percent":
      return splitProportional(amountCents, participants, "percent");
    case "shares":
      return splitProportional(amountCents, participants, "shares");
```

and add:

```ts
function splitProportional(
  amountCents: number,
  participants: SplitParticipant[],
  kind: "percent" | "shares"
): ComputedShare[] {
  for (const p of participants) {
    if (p.value === null || !Number.isFinite(p.value) || p.value < 0) {
      throw new SplitError(
        kind === "percent"
          ? "Each percentage must be a number (0 or more)."
          : "Each share weight must be a number (0 or more)."
      );
    }
  }
  const total = participants.reduce((acc, p) => acc + (p.value as number), 0);
  if (kind === "percent" && Math.abs(total - 100) > 1e-6) {
    throw new SplitError(`Percentages must add up to 100 (got ${total}).`);
  }
  if (kind === "shares" && total <= 0) {
    throw new SplitError("Share weights must add up to more than zero.");
  }

  const floors = participants.map((p) =>
    Math.floor((amountCents * (p.value as number)) / total)
  );
  let remainder = amountCents - floors.reduce((acc, f) => acc + f, 0);
  return participants.map((p, i) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return {
      memberId: p.memberId,
      shareCents: floors[i] + extra,
      splitValue: p.value,
    };
  });
}
```

- [ ] **Step 14: Run to verify pass**

Run: `npm test`
Expected: PASS — all splits tests including the 250×5 invariant sweep.

- [ ] **Step 15: Commit**

```powershell
git add src/lib/splits.ts src/lib/splits.test.ts
git commit -m "feat: split engine — percent and weighted shares"
```

---

### Task 8: Balance engine — `src/lib/balances.ts` (TDD)

**Files:**
- Create: `src/lib/balances.ts`
- Test: `src/lib/balances.test.ts`

Net per member = total paid − total owed, over plain ledger data. Settlements are just expenses — no special-casing.

- [ ] **Step 1: Write failing tests**

Create `src/lib/balances.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeBalances, type LedgerExpense } from "./balances";

describe("computeBalances", () => {
  it("returns zero for every member when there are no expenses", () => {
    const balances = computeBalances(["a", "b"], []);
    expect(balances.get("a")).toBe(0);
    expect(balances.get("b")).toBe(0);
  });

  it("credits the payer and debits the sharers", () => {
    // a pays 3000, split equally three ways
    const expenses: LedgerExpense[] = [
      {
        paidByMemberId: "a",
        amountCents: 3000,
        shares: [
          { memberId: "a", shareCents: 1000 },
          { memberId: "b", shareCents: 1000 },
          { memberId: "c", shareCents: 1000 },
        ],
      },
    ];
    const balances = computeBalances(["a", "b", "c"], expenses);
    expect(balances.get("a")).toBe(2000);
    expect(balances.get("b")).toBe(-1000);
    expect(balances.get("c")).toBe(-1000);
  });

  it("treats a settlement like any other expense", () => {
    const expenses: LedgerExpense[] = [
      {
        paidByMemberId: "a",
        amountCents: 2000,
        shares: [
          { memberId: "a", shareCents: 1000 },
          { memberId: "b", shareCents: 1000 },
        ],
      },
      // b settles up: pays a 1000, single share for a
      {
        paidByMemberId: "b",
        amountCents: 1000,
        shares: [{ memberId: "a", shareCents: 1000 }],
      },
    ];
    const balances = computeBalances(["a", "b"], expenses);
    expect(balances.get("a")).toBe(0);
    expect(balances.get("b")).toBe(0);
  });

  it("nets always sum to zero", () => {
    const expenses: LedgerExpense[] = [
      {
        paidByMemberId: "a",
        amountCents: 101,
        shares: [
          { memberId: "a", shareCents: 34 },
          { memberId: "b", shareCents: 34 },
          { memberId: "c", shareCents: 33 },
        ],
      },
      {
        paidByMemberId: "b",
        amountCents: 999,
        shares: [
          { memberId: "b", shareCents: 500 },
          { memberId: "c", shareCents: 499 },
        ],
      },
      {
        paidByMemberId: "c",
        amountCents: 7,
        shares: [{ memberId: "a", shareCents: 7 }],
      },
    ];
    const balances = computeBalances(["a", "b", "c"], expenses);
    const total = [...balances.values()].reduce((acc, v) => acc + v, 0);
    expect(total).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module './balances'`.

- [ ] **Step 3: Implement**

Create `src/lib/balances.ts`:

```ts
export type LedgerShare = {
  memberId: string;
  shareCents: number;
};

export type LedgerExpense = {
  paidByMemberId: string;
  amountCents: number;
  shares: LedgerShare[];
};

/**
 * Net cents per member across the whole ledger: positive = the group owes
 * them, negative = they owe the group. Settlements are ordinary expenses.
 * Invariant: values always sum to zero when every expense's shares sum to its
 * amount.
 */
export function computeBalances(
  memberIds: string[],
  expenses: LedgerExpense[]
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const id of memberIds) {
    balances.set(id, 0);
  }
  for (const expense of expenses) {
    add(balances, expense.paidByMemberId, expense.amountCents);
    for (const share of expense.shares) {
      add(balances, share.memberId, -share.shareCents);
    }
  }
  return balances;
}

function add(balances: Map<string, number>, memberId: string, delta: number) {
  balances.set(memberId, (balances.get(memberId) ?? 0) + delta);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/balances.ts src/lib/balances.test.ts
git commit -m "feat: balance engine — net per member from the ledger"
```

---

### Task 9: Settle-up suggestions — `src/lib/simplify.ts` (TDD)

**Files:**
- Create: `src/lib/simplify.ts`
- Test: `src/lib/simplify.test.ts`

Greedy min-transfers over net balances. Display-layer only — the ledger stays the sole source of truth.

- [ ] **Step 1: Write failing tests (including the settlement round-trip)**

Create `src/lib/simplify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeBalances, type LedgerExpense } from "./balances";
import { simplifyDebts } from "./simplify";

describe("simplifyDebts", () => {
  it("returns no transfers when everyone is settled", () => {
    expect(simplifyDebts(new Map([["a", 0], ["b", 0]]))).toEqual([]);
    expect(simplifyDebts(new Map())).toEqual([]);
  });

  it("suggests a single transfer for a single debt", () => {
    const transfers = simplifyDebts(new Map([["a", 500], ["b", -500]]));
    expect(transfers).toEqual([
      { fromMemberId: "b", toMemberId: "a", amountCents: 500 },
    ]);
  });

  it("matches the largest debtor against the largest creditor", () => {
    const transfers = simplifyDebts(
      new Map([["a", 100], ["b", 50], ["c", -150]])
    );
    expect(transfers).toEqual([
      { fromMemberId: "c", toMemberId: "a", amountCents: 100 },
      { fromMemberId: "c", toMemberId: "b", amountCents: 50 },
    ]);
  });

  it("breaks amount ties deterministically by member id", () => {
    const transfers = simplifyDebts(
      new Map([["b", 50], ["a", 50], ["d", -50], ["c", -50]])
    );
    expect(transfers).toEqual([
      { fromMemberId: "c", toMemberId: "a", amountCents: 50 },
      { fromMemberId: "d", toMemberId: "b", amountCents: 50 },
    ]);
  });

  it("zeroes every balance when its suggestions are recorded as settlements", () => {
    const members = ["a", "b", "c", "d"];
    const expenses: LedgerExpense[] = [
      {
        paidByMemberId: "a",
        amountCents: 10001,
        shares: [
          { memberId: "a", shareCents: 2501 },
          { memberId: "b", shareCents: 2500 },
          { memberId: "c", shareCents: 2500 },
          { memberId: "d", shareCents: 2500 },
        ],
      },
      {
        paidByMemberId: "b",
        amountCents: 333,
        shares: [
          { memberId: "c", shareCents: 167 },
          { memberId: "d", shareCents: 166 },
        ],
      },
    ];
    const balances = computeBalances(members, expenses);
    const transfers = simplifyDebts(balances);

    // Record each suggestion as a settlement expense and recompute.
    const settlements: LedgerExpense[] = transfers.map((t) => ({
      paidByMemberId: t.fromMemberId,
      amountCents: t.amountCents,
      shares: [{ memberId: t.toMemberId, shareCents: t.amountCents }],
    }));
    const after = computeBalances(members, [...expenses, ...settlements]);
    for (const id of members) {
      expect(after.get(id)).toBe(0);
    }
  });

  it("never suggests more transfers than members minus one", () => {
    const balances = new Map([
      ["a", 300],
      ["b", -100],
      ["c", -100],
      ["d", -100],
    ]);
    expect(simplifyDebts(balances).length).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module './simplify'`.

- [ ] **Step 3: Implement**

Create `src/lib/simplify.ts`:

```ts
export type SuggestedTransfer = {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
};

type Party = { id: string; cents: number };

/**
 * Greedy minimum-transfer suggestions: repeatedly settle the largest debtor
 * against the largest creditor (ties broken by member id, so output is
 * deterministic). Display-layer only — the ledger remains the source of truth.
 */
export function simplifyDebts(
  balances: Map<string, number>
): SuggestedTransfer[] {
  const debtors: Party[] = [];
  const creditors: Party[] = [];
  for (const [id, net] of balances) {
    if (net < 0) debtors.push({ id, cents: -net });
    if (net > 0) creditors.push({ id, cents: net });
  }

  const byAmountDescThenId = (a: Party, b: Party) =>
    b.cents - a.cents || a.id.localeCompare(b.id);

  const transfers: SuggestedTransfer[] = [];
  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(byAmountDescThenId);
    creditors.sort(byAmountDescThenId);
    const debtor = debtors[0];
    const creditor = creditors[0];
    const amount = Math.min(debtor.cents, creditor.cents);
    transfers.push({
      fromMemberId: debtor.id,
      toMemberId: creditor.id,
      amountCents: amount,
    });
    debtor.cents -= amount;
    creditor.cents -= amount;
    if (debtor.cents === 0) debtors.shift();
    if (creditor.cents === 0) creditors.shift();
  }
  return transfers;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS — full suite (lib utilities + splits + balances + simplify).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/simplify.ts src/lib/simplify.test.ts
git commit -m "feat: greedy settle-up suggestions over net balances"
```

---

### Task 10: End-to-end verification

Requires Task 6 (Supabase project + `.env.local`) to be done.

- [ ] **Step 1: Full automated check**

Run: `npm test`
Expected: PASS — all test files green.

Run: `npm run build`
Expected: build succeeds with no type errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Auth smoke test (manual, in a browser)**

Run: `npm run dev`, open http://localhost:3000:

1. Home page renders with "Log in / Register" links.
2. Register a test account (name + email + password ≥ 6 chars) → redirected to home, AuthNav shows the display name.
3. Log out → links return. Log in again with the same credentials → signed in.
4. Forgot-password flow: submit your email on `/forgot-password` → "reset sent" notice on `/login`. (Following the emailed link through `/auth/callback` to `/update-password` exercises the PKCE callback — do it if the email arrives; free-tier auth emails can be slow.)

- [ ] **Step 3: Commit anything outstanding**

```powershell
git status
git add -A
git commit -m "chore: foundation complete"
```

Expected: working tree clean (or only this final commit).

---

## Phase 2 / Phase 3 preview (separate plans, not this one)

- **Phase 2:** `src/lib/db.ts` query layer, dashboard (`/`), group create, `/groups/[id]` (balances, suggested settle-ups, expense list, add expense, record payment, copy invite link), `/groups/[id]/expenses/[expenseId]` edit/delete, `/g/[inviteToken]` join/claim flow with Zod-validated Server Actions.
- **Phase 3:** `vercel.json` cron + `/api/cron/backup` (CRON_SECRET check, service-role export, commit JSON snapshot to private GitHub repo), Vercel deploy, production auth URLs.
