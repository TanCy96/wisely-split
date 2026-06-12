# wisely-split Feedback Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anonymous visitors must pick a member identity before the invite page's write UI unlocks (recorded as `expenses.created_by_member`), and expense editing moves from the aside-swap into an instantly-opening modal dialog.

**Architecture:** Identity is a per-group httpOnly cookie holding a `group_members.id`, validated server-side on every token write (`requireInvite` gains a `requireIdentity` option). Attribution is a new nullable FK column stamped on create only. The modal keeps `?edit=<id>` as the source of truth but opens via `window.history.replaceState` (Next syncs `useSearchParams` with no server round-trip); server actions and the redirect-with-`?error=` model are untouched — a failed save redirects to `?edit=<id>&error=…` and the error renders inside the modal.

**Tech Stack:** unchanged — Next.js 15 App Router, Supabase, Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-12-wisely-split-feedback-round-2-design.md` (user-approved).

**Conventions (carried from rounds 1):**
- Branch off `main` (suggested: `feedback-2`). Work from `D:\Projects\wisely-split` (Windows, PowerShell).
- **Commit at the end of every task.** Lean verification: don't re-run suites when nothing changed. No new unit tests — there is no new pure logic (engine untouched); verification is build/lint + live smoke (Task 11).
- Errors via `redirect("path?error=...")` + `<Alert tone="danger">`.
- Migrations applied manually by the user in the Supabase SQL editor — hand over a checklist and keep working.
- The dev smoke group is "Phase2 Smoke", invite token `iYSzp8AfA3l-QbtMCyM1n8`, group id `723d24ef-336d-4cba-aa1a-56692df2b0fe`; smoke account `chiyang+smoketest1@tatsu.works` / `smoketest-pw-123`.
- Smoke technique that works here: progressive-enhancement form POSTs with curl (parse the form's `$ACTION_ID_*` hidden field from the SSR HTML, POST multipart to the page URL). Supabase REST blocks the service key from browser-like User-Agents — inspect rows with a node script using `@supabase/supabase-js`.

---

### Task 1: Migration — `expenses.created_by_member` (MANUAL APPLY — user)

**Files:**
- Create: `supabase/migrations/2026-06-12-created-by-member.sql`

- [ ] **Step 1:** Write the migration:

```sql
-- Attribution for the anonymous-identity feature: which MEMBER created an
-- expense (works for anonymous and signed-in actors; created_by keeps
-- tracking the auth user when there is one). Stamped on create only —
-- semantic is "added by", never re-stamped on edit. NULL on all pre-existing
-- rows and when the creating member is later deleted.

alter table expenses
  add column created_by_member uuid references group_members (id) on delete set null;
```

- [ ] **Step 2:** Commit: `git commit -m "feat: migration - expenses.created_by_member attribution column"`
- [ ] **Step 3:** **PAUSE — hand to the user:** run the file in Supabase dashboard → SQL Editor (expect "Success. No rows returned"). Continue with Task 2 while waiting; Tasks 2+ change `EXPENSE_COLUMNS`, so any **runtime** page load against the live DB fails until this is applied (build/lint/tests don't touch the DB and stay green).

---

### Task 2: db.ts — column plumbing + addMemberViaToken returns the new member id

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1:** In `ExpenseRow`, after `created_by`, add:

```ts
  created_by_member: string | null; // member who added it ("added by"); stamped on create only
```

- [ ] **Step 2:** In `ExpenseInput`, after `createdBy`, add an optional field (optional so the four existing callers keep compiling until Tasks 4–5 stamp it):

```ts
  createdByMember?: string | null;
```

- [ ] **Step 3:** In `EXPENSE_COLUMNS`, add the column (first line of the string):

```ts
const EXPENSE_COLUMNS =
  "id, group_id, description, amount_cents, paid_by, split_method, is_settlement, " +
  "expense_date, created_by, created_by_member, created_at, updated_at, " +
  "expense_shares (id, expense_id, member_id, share_cents, split_value)";
```

- [ ] **Step 4:** In `createExpense`, add to the insert object (after `created_by`):

```ts
    created_by_member: input.createdByMember ?? null,
```

- [ ] **Step 5:** In `createExpenseViaToken`, add the identical line to its insert object (after `created_by`). Do NOT touch `updateExpense`/`updateExpenseViaToken` — edits never re-stamp.

- [ ] **Step 6:** Change `addMemberViaToken` to return the created member's id (the identity flow needs it for the cookie; the existing caller only checks `"error" in result`, so widening the success shape is compatible):

```ts
export async function addMemberViaToken(
  token: string,
  displayName: string
): Promise<{ groupId: string; memberId: string } | { error: string }> {
  const invite = await getGroupByInviteToken(token);
  if (!invite) return { error: "This invite link is invalid." };
  const { data, error } = await admin()
    .from("group_members")
    .insert({
      group_id: invite.group.id,
      display_name: displayName,
      user_id: null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: "Could not add that member. Please try again." };
  }
  return { groupId: invite.group.id, memberId: data.id };
}
```

- [ ] **Step 7:** `npm run build` + `npm test` (suite stays 58). **Commit:** `git commit -m "feat: created_by_member plumbing in db layer"`

---

### Task 3: Identity cookie helper

**Files:**
- Create: `src/lib/identity.ts`

- [ ] **Step 1:** Create the helper. Reading works anywhere server-side; set/clear are only legal inside Server Actions (Next.js restriction) — which is where they're called (Task 4):

```ts
import { cookies } from "next/headers";
import type { MemberRow } from "./db";

/**
 * Anonymous identity = a per-group httpOnly cookie holding a group_members.id.
 * Honor-system attribution for a friend group, NOT authentication — the
 * invite token remains the only authorization. Validated against the live
 * member list on every read so a stale cookie (member deleted) reads as absent.
 */
export function identityCookieName(groupId: string): string {
  return `ws_identity_${groupId}`;
}

export async function currentIdentity(
  groupId: string,
  members: MemberRow[]
): Promise<string | null> {
  const store = await cookies();
  const value = store.get(identityCookieName(groupId))?.value;
  return value && members.some((m) => m.id === value) ? value : null;
}

export async function setIdentity(
  groupId: string,
  memberId: string
): Promise<void> {
  const store = await cookies();
  store.set(identityCookieName(groupId), memberId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearIdentity(groupId: string): Promise<void> {
  const store = await cookies();
  store.delete(identityCookieName(groupId));
}
```

- [ ] **Step 2:** `npm run build`. **Commit:** `git commit -m "feat: per-group identity cookie helper"`

---

### Task 4: Token actions — identity enforcement, identify/switch actions, stamping

**Files:**
- Modify: `src/app/token-actions.ts`

- [ ] **Step 1:** Add imports: `addMemberViaToken` is already imported; add to the `@/lib/db` import nothing new; add a new import line:

```ts
import { clearIdentity, currentIdentity, setIdentity } from "@/lib/identity";
```

- [ ] **Step 2:** Replace `requireInvite` with a version that resolves (and can require) the identity cookie:

```ts
/** Validates the token + loads members, or redirects away. With
 *  requireIdentity, also enforces the anonymous-identity gate: the write
 *  is rejected unless the visitor has picked a member identity (cookie). */
async function requireInvite(
  formData: FormData,
  opts: { requireIdentity?: boolean } = {}
) {
  const token = tokenSchema.safeParse(formData.get("token"));
  if (!token.success) redirect("/");
  const invite = await getGroupByInviteToken(token.data);
  if (!invite) redirect("/");
  const path = `/g/${token.data}`;
  const identityMemberId = await currentIdentity(
    invite.group.id,
    invite.members
  );
  if (opts.requireIdentity && !identityMemberId) {
    redirect(fail(path, "Pick your name first."));
  }
  return { token: token.data, invite, path, identityMemberId };
}
```

- [ ] **Step 3:** Gate every existing write action — change the first line of `addMemberViaTokenAction`, `addExpenseViaTokenAction`, `recordPaymentViaTokenAction`, `updateExpenseViaTokenAction`, and `deleteExpenseViaTokenAction` to:

```ts
  const { token, invite, path, identityMemberId } = await requireInvite(
    formData,
    { requireIdentity: true }
  );
```

(keep only the destructured names each action actually uses; `addMemberViaTokenAction` and `deleteExpenseViaTokenAction` don't use `invite` or `identityMemberId` — destructure `{ token, path }` there and ESLint stays clean).

- [ ] **Step 4:** Stamp attribution on the two creating actions. In `addExpenseViaTokenAction` and `recordPaymentViaTokenAction`, add to the expense input object (after `createdBy`):

```ts
      createdByMember: identityMemberId,
```

(`identityMemberId` is non-null here because `requireIdentity: true` redirected otherwise.)

- [ ] **Step 5:** Append the two identity actions at the end of the file:

```ts
export async function identifyViaTokenAction(formData: FormData) {
  const { token, invite, path } = await requireInvite(formData);
  const memberIdRaw = formData.get("member_id");
  let memberId: string;
  if (memberIdRaw) {
    const parsed = z.uuid().safeParse(memberIdRaw);
    if (!parsed.success || !invite.members.some((m) => m.id === parsed.data)) {
      redirect(fail(path, "That name is not in this group."));
    }
    memberId = parsed.data;
  } else {
    const name = nameSchema.safeParse(formData.get("display_name"));
    if (!name.success) redirect(fail(path, "Enter your name."));
    const result = await addMemberViaToken(token, name.data);
    if ("error" in result) redirect(fail(path, result.error));
    memberId = result.memberId;
  }
  await setIdentity(invite.group.id, memberId);
  revalidatePath(path);
  redirect(path);
}

export async function clearIdentityViaTokenAction(formData: FormData) {
  const { invite, path } = await requireInvite(formData);
  await clearIdentity(invite.group.id);
  revalidatePath(path);
  redirect(path);
}
```

- [ ] **Step 6:** `npm run build` + `npm test`. **Commit:** `git commit -m "feat: identity gate on token writes, identify/switch actions, attribution stamping"`

---

### Task 5: Member actions — stamp the signed-in user's own member row

**Files:**
- Modify: `src/app/group-actions.ts`

- [ ] **Step 1:** In `addExpenseAction`, the member list is already fetched as `members`. Add to the `createExpense` input object (after `createdBy: userId`):

```ts
      createdByMember: members.find((m) => m.user_id === userId)?.id ?? null,
```

- [ ] **Step 2:** In `recordPaymentAction`, same line in its `createExpense` input (it also has a fetched `members` array).

- [ ] **Step 3:** `npm run build`. **Commit:** `git commit -m "feat: stamp member attribution on signed-in expense creation"`

---

### Task 6: ExpenseForm — `defaultPaidBy` prop

**Files:**
- Modify: `src/components/ExpenseForm.tsx`

- [ ] **Step 1:** Add the prop to the signature (after `hiddenFields`):

```ts
  defaultPaidBy?: string;
```

(and to the destructuring). Change the Paid-by select to:

```tsx
        <Select name="paid_by" defaultValue={initial?.paidBy ?? defaultPaidBy}>
```

- [ ] **Step 2:** `npm run build`. **Commit:** `git commit -m "feat: paid-by default for identified visitors"`

---

### Task 7: ExpenseList client island — instant modal editing

**Files:**
- Create: `src/components/ExpenseList.tsx`

Rows are real `<a href="?edit=<id>">` links (no-JS fallback: SSR renders the modal open). With JS, click intercepts and uses `window.history.replaceState`, which Next.js syncs into `useSearchParams` with **no server round-trip** — instant open with data already on the page. Save/Delete keep the existing server actions: success redirects to `basePath` (URL loses `?edit=` → modal closes, fresh data); a validation failure redirects to `?edit=<id>&error=…` (modal renders open with the error inside).

- [ ] **Step 1:** Create the component:

```tsx
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Card } from "@/components/ui";
import {
  ExpenseForm,
  type ExpenseFormInitial,
  type ExpenseFormMemberOption,
} from "@/components/ExpenseForm";

export type ExpenseListItem = {
  id: string;
  description: string;
  amountLabel: string; // preformatted money string
  meta: string; // "2026-06-12 · paid by X · settle-up · added by Y"
  initial: ExpenseFormInitial; // precomputed server-side
};

/**
 * Expense list + edit modal. The URL (?edit=<id>) is the source of truth;
 * opening uses history.replaceState so it's instant (Next syncs
 * useSearchParams without a server request). Plain rows when !canEdit
 * (anonymous visitor who hasn't picked an identity).
 */
export function ExpenseList({
  items,
  members,
  basePath,
  hiddenFields,
  updateAction,
  deleteAction,
  error,
  canEdit,
}: {
  items: ExpenseListItem[];
  members: ExpenseFormMemberOption[];
  basePath: string;
  hiddenFields: Record<string, string>;
  updateAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
  error?: string;
  canEdit: boolean;
}) {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const editing = canEdit && editId ? items.find((i) => i.id === editId) : undefined;

  const close = () => window.history.replaceState(null, "", basePath);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  const rowClass =
    "flex items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-sm";
  const rowBody = (item: ExpenseListItem) => (
    <>
      <span>
        <span className="font-semibold text-ink">{item.description}</span>
        <span className="ml-2 text-xs text-muted">{item.meta}</span>
      </span>
      <span className="font-semibold text-ink">{item.amountLabel}</span>
    </>
  );

  return (
    <>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            {canEdit ? (
              <a
                href={`${basePath}?edit=${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  window.history.replaceState(
                    null,
                    "",
                    `${basePath}?edit=${item.id}`
                  );
                }}
                className={
                  rowClass +
                  " hover:bg-black/5 dark:hover:bg-white/5" +
                  (item.id === editing?.id ? " bg-black/5 dark:bg-white/5" : "")
                }
              >
                {rowBody(item)}
              </a>
            ) : (
              <div className={rowClass}>{rowBody(item)}</div>
            )}
          </li>
        ))}
      </ul>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:py-10"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-md">
            <Card title="Edit expense" className="shadow-xl">
              {error && <Alert tone="danger">{error}</Alert>}
              <ExpenseForm
                key={editing.id}
                action={updateAction}
                members={members}
                defaultDate={editing.initial.expenseDate}
                submitLabel="Save changes"
                hiddenFields={{ ...hiddenFields, expense_id: editing.id }}
                initial={editing.initial}
              />
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={close}
                  className="text-sm font-semibold text-muted hover:underline"
                >
                  Cancel
                </button>
                <form action={deleteAction}>
                  {Object.entries(hiddenFields).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                  ))}
                  <input type="hidden" name="expense_id" value={editing.id} />
                  <Button variant="danger" className="px-3 py-1.5 text-xs">
                    Delete expense
                  </Button>
                </form>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2:** `npm run build`. **Commit:** `git commit -m "feat: expense list island with instant edit modal"`

---

### Task 8: GroupView — render the island, drop the aside swap, add lock mode

**Files:**
- Modify: `src/components/GroupView.tsx`

Changes: (a) the aside always shows "Add expense"; (b) the expense list + editing move into `ExpenseList` with precomputed per-row data; (c) a `locked` ReactNode replaces ALL write UI when present; (d) the top-of-page alert is suppressed exactly when the modal will be open; (e) `defaultPaidBy` flows to the add form.

- [ ] **Step 1:** Update imports — remove `Link` (no longer used after the list moves out; the Cancel link is gone too), add:

```ts
import { ExpenseList, type ExpenseListItem } from "@/components/ExpenseList";
```

- [ ] **Step 2:** Add the new props to the signature (after `topCards`):

```ts
  locked,
  defaultPaidBy,
```

```ts
  locked?: ReactNode; // when present, replaces every write form (identity gate)
  defaultPaidBy?: string;
```

- [ ] **Step 3:** Delete the whole `editing`/`editingInitial` block and the `hiddenInputs` const. Replace with the precomputed rows and modal bookkeeping (after `memberOptions`):

```ts
  const canEdit = !locked;
  const items: ExpenseListItem[] = expenses.map((e) => {
    const included: Record<string, boolean> = {};
    const values: Record<string, string> = {};
    for (const share of e.expense_shares) {
      included[share.member_id] = true;
      if (e.split_method === "exact") {
        values[share.member_id] = centsToMoneyString(share.share_cents);
      } else if (share.split_value !== null) {
        values[share.member_id] = String(share.split_value);
      }
    }
    const addedBy = e.created_by_member
      ? nameOf.get(e.created_by_member)
      : undefined;
    return {
      id: e.id,
      description: e.description,
      amountLabel: formatMoney(e.amount_cents, group.currency_code),
      meta: [
        e.expense_date,
        `paid by ${nameOf.get(e.paid_by) ?? "?"}`,
        ...(e.is_settlement ? ["settle-up"] : []),
        ...(addedBy ? [`added by ${addedBy}`] : []),
      ].join(" · "),
      initial: {
        description: e.description,
        amount: centsToMoneyString(e.amount_cents),
        paidBy: e.paid_by,
        expenseDate: e.expense_date,
        splitMethod: e.split_method,
        included,
        values,
      },
    };
  });
  // The edit modal will be open (SSR) iff a valid id is in ?edit= and editing
  // is allowed — in that case the island shows the error inside the modal and
  // the top-of-page alert must stay silent.
  const modalOwnsError =
    canEdit && Boolean(editingId && expenses.some((e) => e.id === editingId));
```

- [ ] **Step 4:** Replace the entire `aside={...}` content with the lock-aware version:

```tsx
      aside={
        locked ? (
          locked
        ) : (
          <>
            <Card title="Add expense">
              <ExpenseForm
                key="new"
                action={actions.addExpense}
                members={memberOptions}
                defaultDate={today}
                submitLabel="Add expense"
                hiddenFields={hiddenFields}
                defaultPaidBy={defaultPaidBy}
              />
            </Card>
            <Card title="Members">
              <ul className="mb-3 flex flex-col gap-1 text-sm">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-ink">{m.display_name}</span>
                  </li>
                ))}
              </ul>
              <form action={actions.addMember} className="flex items-end gap-2">
                {Object.entries(hiddenFields).map(([name, value]) => (
                  <input key={name} type="hidden" name={name} value={value} />
                ))}
                <Field label="Add a name">
                  <Input
                    name="display_name"
                    placeholder="Alex"
                    required
                    maxLength={80}
                  />
                </Field>
                <Button variant="secondary" className="shrink-0">
                  Add
                </Button>
              </form>
            </Card>
          </>
        )
      }
```

(When locked, the members list is still visible inside the `locked` card the page provides — see Task 9; the aside shows only that card.)

- [ ] **Step 5:** Change the top alert line to:

```tsx
      {error && !modalOwnsError && <Alert tone="danger">{error}</Alert>}
```

- [ ] **Step 6:** In the Settle-up card, hide the form when locked — wrap the `<SettleUpForm …/>` in:

```tsx
        {canEdit && (
          <SettleUpForm
            action={actions.recordPayment}
            members={memberOptions}
            hiddenFields={hiddenFields}
          />
        )}
```

- [ ] **Step 7:** Replace the Expenses card body (the whole `expenses.length === 0 ? … : <ul>…</ul>` block) with:

```tsx
      <Card title="Expenses">
        {items.length === 0 ? (
          <p className="text-sm text-muted">No expenses yet.</p>
        ) : (
          <ExpenseList
            items={items}
            members={memberOptions}
            basePath={basePath}
            hiddenFields={hiddenFields}
            updateAction={actions.updateExpense}
            deleteAction={actions.deleteExpense}
            error={modalOwnsError ? error : undefined}
            canEdit={canEdit}
          />
        )}
      </Card>
```

- [ ] **Step 8:** `npm run build` + `npm run lint` (unused imports will fail lint — clean them: `Link`, possibly `StatRow` is still used for balances, keep it). **Commit:** `git commit -m "feat: GroupView renders modal expense editing and identity lock mode"`

---

### Task 9: Invite page — identity picker, identity bar, lock wiring

**Files:**
- Rewrite: `src/app/g/[inviteToken]/page.tsx`

Rules (from the spec): signed-in members → redirect (unchanged). The "Who are you?" picker renders **only for signed-out visitors** without a valid identity cookie. Signed-in non-members keep claim/join cards and stay locked until they claim/join. A leftover identity cookie unlocks writes even when signed in (honor system). Identified visitors get an identity bar: "You're here as **Alex** — switch".

- [ ] **Step 1:** Rewrite the page:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { claimMemberAction, joinGroupAction } from "@/app/group-actions";
import {
  addExpenseViaTokenAction,
  addMemberViaTokenAction,
  clearIdentityViaTokenAction,
  deleteExpenseViaTokenAction,
  identifyViaTokenAction,
  recordPaymentViaTokenAction,
  updateExpenseViaTokenAction,
} from "@/app/token-actions";
import { AuthNav } from "@/components/AuthNav";
import { GroupView } from "@/components/GroupView";
import { Button, Card, Field, Input } from "@/components/ui";
import { getGroupDataViaToken } from "@/lib/db";
import { currentIdentity } from "@/lib/identity";
import { serverAuth } from "@/lib/supabase-auth";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ inviteToken: string }>;
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  const { inviteToken } = await params;
  const { error, edit } = await searchParams;
  const data = await getGroupDataViaToken(inviteToken);
  if (!data) notFound();
  const { group, members, expenses } = data;

  const supabase = await serverAuth();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  // Members use the canonical RLS view.
  if (user && members.some((m) => m.user_id === user.id)) {
    redirect(`/groups/${group.id}`);
  }

  const joinPath = `/g/${inviteToken}`;
  const identityId = await currentIdentity(group.id, members);
  const identityName = identityId
    ? members.find((m) => m.id === identityId)?.display_name
    : undefined;
  const placeholders = members.filter((m) => m.user_id === null);
  const defaultName =
    user && typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : "";

  const identityBar = identityId ? (
    <p className="text-sm text-muted">
      You&apos;re here as{" "}
      <span className="font-semibold text-ink">{identityName}</span> —{" "}
      <span className="inline-block">
        <form action={clearIdentityViaTokenAction} className="inline">
          <input type="hidden" name="token" value={inviteToken} />
          <button className="font-semibold text-primary hover:underline">
            switch
          </button>
        </form>
      </span>
    </p>
  ) : null;

  // Locked card: the single write-UI replacement while unidentified.
  const locked = identityId ? undefined : !user ? (
    <Card title="Who are you?" highlight>
      <p className="mb-3 text-sm text-muted">
        Pick your name to start adding expenses — no account needed.
      </p>
      <ul className="mb-3 flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.id}>
            <form action={identifyViaTokenAction}>
              <input type="hidden" name="token" value={inviteToken} />
              <input type="hidden" name="member_id" value={m.id} />
              <Button variant="secondary" className="w-full">
                I&apos;m {m.display_name}
              </Button>
            </form>
          </li>
        ))}
      </ul>
      <form action={identifyViaTokenAction} className="flex items-end gap-2">
        <input type="hidden" name="token" value={inviteToken} />
        <Field label="Or add your name">
          <Input name="display_name" placeholder="Alex" required maxLength={80} />
        </Field>
        <Button className="shrink-0">That&apos;s me</Button>
      </form>
    </Card>
  ) : (
    <Card title="Want to add expenses?">
      <p className="text-sm text-muted">
        Claim your name or join the group first — see the cards at the top of
        the page.
      </p>
    </Card>
  );

  const topCards = !user ? (
    <>
      {identityBar}
      {!identityId && (
        <Card>
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">
              You can use this page without an account.
            </span>{" "}
            Pick your name in the &quot;Who are you?&quot; card to start adding
            expenses, and bookmark this link to come back. If you want this
            group on your own dashboard,{" "}
            <Link
              href={`/login?next=${encodeURIComponent(joinPath)}`}
              className="font-semibold text-primary hover:underline"
            >
              log in
            </Link>{" "}
            or{" "}
            <Link
              href={`/register?next=${encodeURIComponent(joinPath)}`}
              className="font-semibold text-primary hover:underline"
            >
              register
            </Link>
            .
          </p>
        </Card>
      )}
    </>
  ) : (
    <>
      {identityBar}
      {placeholders.length > 0 && (
        <Card title="Is one of these you?">
          <ul className="flex flex-col gap-2">
            {placeholders.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-semibold text-ink">{m.display_name}</span>
                <form action={claimMemberAction}>
                  <input type="hidden" name="token" value={inviteToken} />
                  <input type="hidden" name="member_id" value={m.id} />
                  <Button variant="secondary" className="px-3 py-1.5 text-xs">
                    This is me
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Join as a new member">
        <form action={joinGroupAction} className="flex flex-col gap-3">
          <input type="hidden" name="token" value={inviteToken} />
          <Field label="Your name">
            <Input
              name="display_name"
              defaultValue={defaultName}
              required
              maxLength={80}
            />
          </Field>
          <Button>Join group</Button>
        </form>
      </Card>
    </>
  );

  return (
    <GroupView
      group={group}
      members={members}
      expenses={expenses}
      actions={{
        addExpense: addExpenseViaTokenAction,
        updateExpense: updateExpenseViaTokenAction,
        deleteExpense: deleteExpenseViaTokenAction,
        recordPayment: recordPaymentViaTokenAction,
        addMember: addMemberViaTokenAction,
      }}
      hiddenFields={{ token: inviteToken }}
      basePath={joinPath}
      editingId={edit && z.uuid().safeParse(edit).success ? edit : undefined}
      error={error}
      inviteUrl={`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}${joinPath}`}
      headerRight={<AuthNav />}
      topCards={topCards}
      locked={locked}
      defaultPaidBy={identityId ?? undefined}
    />
  );
}
```

- [ ] **Step 2:** `npm run build` + `npm run lint`. **Commit:** `git commit -m "feat: anonymous identity picker and gate on the invite page"`

---

### Task 10: Member page — default Paid-by to the signed-in member

**Files:**
- Modify: `src/app/groups/[id]/page.tsx`

- [ ] **Step 1:** After `const expenses = await listExpenses(id);` add:

```ts
  const myMemberId = members.find((m) => m.user_id === userId)?.id;
```

and pass to GroupView (after `headerRight`):

```tsx
      defaultPaidBy={myMemberId}
```

- [ ] **Step 2:** `npm run build`. **Commit:** `git commit -m "feat: member view defaults paid-by to yourself"`

---

### Task 11: End-to-end verification

- [ ] **Step 1:** Automated: `npm test` (58), `npm run lint`, `npm run build` — all green.
- [ ] **Step 2:** Live smoke (dev server, real Supabase, Task 1 migration applied). Anonymous flow with NO cookies:
  1. `GET /g/<token>` → group fully readable; "Who are you?" card with one button per member + "Or add your name"; NO add-expense/settle/add-member forms; expense rows are NOT links.
  2. POST a write action without the identity cookie (curl, `$ACTION_ID` technique) → 303 to `?error=Pick%20your%20name%20first.` and no DB write.
  3. POST `identifyViaTokenAction` with an existing `member_id` → 303, `set-cookie: ws_identity_<groupId>=<memberId>` present. With the cookie: write forms render, identity bar shows "You're here as … — switch", Paid-by preselects them.
  4. Add an expense with the cookie → row has `created_by_member` = the cookie's member id (node script) and the list shows "added by …".
  5. New-name path: clear cookie, POST identify with `display_name` → creates a placeholder member AND sets the cookie to it.
  6. "switch" POST → cookie cleared, picker returns.
  7. Stale cookie: set the cookie to a random uuid → treated as absent (picker shows, writes blocked).
  8. Modal: `GET /g/<token>?edit=<expenseId>` (with identity) → SSR HTML contains the open modal ("Edit expense", prefilled values, Delete button) and NO top-of-page error duplication when `&error=…` is added — the error renders inside the modal markup only. Signed-in member view: same checks on `/groups/<id>?edit=…`.
  9. Member view: add an expense as the smoke account → `created_by_member` = their member row; Paid-by preselected to them.
  10. Browser check (the one thing curl can't see): clicking a row opens the modal with no visible navigation/reload; Esc and backdrop close it; Save closes it and the list updates. Use the dev server in a real browser, or note for the user to confirm.
- [ ] **Step 3:** Clean up smoke artifacts (delete test expenses/members via the real actions or service-role script), then final code review of the branch (controller dispatches reviewers), then merge per finishing-a-development-branch.

---

## Out of scope

Last-edited-by tracking, authenticating anonymous identities, modal for "Add expense", animations, edit history. (Spec §Out of scope.)
