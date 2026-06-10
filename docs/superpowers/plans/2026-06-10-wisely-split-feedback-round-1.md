# wisely-split Feedback Round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address the user's first hands-on feedback: UI polish (branding, currency, balances wording, inline editing) and the big one — **anonymous full access via the invite link** (accounts become optional).

**Architecture:** Small fixes are surgical edits to Phase 2 pages/components. The anonymous-access feature extends the existing two-client model in `db.ts`: the invite token (already the read capability for `/g/[token]`) becomes a full read/write capability — token-validated server actions run on the service-role client, mirroring the member actions. The group UI is extracted into a shared `GroupView` server component rendered by both `/groups/[id]` (RLS/member mode) and `/g/[inviteToken]` (token mode). `expenses.created_by` becomes nullable (anonymous actors have no auth uid).

**Tech Stack:** unchanged — Next.js 15 App Router, Supabase, Zod 4, Vitest.

**User decisions captured (2026-06-10):**
1. Accounts optional → **anonymous full access** via invite link (token = full read/write capability: add/edit/delete expenses, settle, add members — explicitly confirmed). Dashboard stays account-only; anonymous users bookmark their `/g/<token>` links (explicitly confirmed).
2. Default currency **RM**; stop demanding a 3-letter code (it's display-only — free label).
3. No placeholder dots in password fields.
4. Settle-up From/To must not be the same person (prevent in UI, not just server error).
5. `shares` split mode: **remove from UI only** (engine/DB support stays; explained as weight-based splitting, user chose to hide).
6. Show group total spent prominently (solo groups always net 0 — explained, accepted).
7. Balances in words + color: "X is owed RM 12.00" (green) / "Y owes RM 12.00" (red) / "settled up" (muted).
8. Drop the confusing "placeholder" tag in the members list.
9. Expense edit should swap into the aside (like Add expense), not navigate to a page → `?edit=<expenseId>` search param.
10. Brand is "**Wisely Split**" (header, titles).

**Conventions (carried from Phases 1–2):**
- Branch off `main` (suggested: `feedback-1`). Work from `D:\Projects\wisely-split` (Windows, PowerShell).
- **Commit at the end of every task.** Run the suite once per change; don't re-run when nothing changed.
- Errors via `redirect("path?error=...")` + `<Alert tone="danger">`.
- Migrations are applied manually by the user in the Supabase SQL editor — pause and hand over a checklist (the user does this quickly; see Task 7).
- Verify with `npm test` / `npm run build` / `npm run lint`; live smoke happens in Task 11.
- **Lesson from Phase 2:** RLS policy subqueries on other tables run under the caller's RLS — don't trust policy reasoning without a live test.

---

### Task 1: Rebrand to "Wisely Split"

**Files:**
- Modify: `src/components/ui/PageShell.tsx` (header brand)
- Modify: `src/app/layout.tsx` (metadata)
- Modify: `src/app/page.tsx` (h1 — note: after Task 10 the h1 lives where it lives then; this task is done first, change it here)

- [ ] **Step 1:** In `PageShell.tsx` line ~9: `💸 wisely-split` → `💸 Wisely Split`.
- [ ] **Step 2:** In `layout.tsx`: `title: "wisely-split"` → `title: "Wisely Split"`.
- [ ] **Step 3:** In `src/app/page.tsx`: the signed-in/landing `<h1>`/card copy says "wisely-split" nowhere except — verify with `Grep "wisely-split" src/` and fix any user-visible occurrence (leave `package.json` and code identifiers alone).
- [ ] **Step 4:** `npm run build` → green. **Commit:** `git commit -m "feat: rebrand to Wisely Split"`

---

### Task 2: Form polish — currency default RM, no password dots

**Files:**
- Modify: `src/app/page.tsx` (create-group form)
- Modify: `src/app/group-actions.ts` (`createGroupSchema`)
- Modify: `src/app/(auth)/register/page.tsx`, `src/app/(auth)/update-password/page.tsx` (password placeholders)

- [ ] **Step 1:** In `src/app/page.tsx` create-group form: change the Currency field to

```tsx
<Field label="Currency label (shown next to amounts)">
  <Input name="currency_code" defaultValue="RM" required maxLength={8} />
</Field>
```

- [ ] **Step 2:** In `group-actions.ts`, `createGroupSchema.currency_code` — it's display-only, so stop demanding ISO codes:

```ts
  currency_code: z
    .string()
    .trim()
    .min(1, "Currency label is required.")
    .max(8, "Keep the currency label short."),
```

(Remove the `.toUpperCase()` and the 3-letter regex.)

- [ ] **Step 3:** Remove `placeholder="••••••••"` from the password `<Input>`s in `register/page.tsx` and `update-password/page.tsx` (login has none; leave everything else in those files untouched).
- [ ] **Step 4:** `npm test` (currency schema isn't unit-tested — suite stays 58) + `npm run build`. **Commit:** `git commit -m "feat: RM currency label default, drop password placeholder dots"`

---

### Task 3: Hide `shares` split mode from the UI

**Files:**
- Modify: `src/components/ExpenseForm.tsx`

UI-only removal (user decision): engine, validation, and DB check constraint keep supporting `shares` so existing data still renders and re-enabling is a one-line revert.

- [ ] **Step 1:** Delete the line `<option value="shares">Shares</option>` from the split `Select`. Leave `VALUE_PLACEHOLDER`, types, and everything else intact (an existing shares-split expense opened for editing still works — `initial.splitMethod="shares"` selects nothing visible but the controlled value holds; acceptable for hidden-mode legacy rows. If lint complains about the now-unused `shares` key in `VALUE_PLACEHOLDER`, keep it — it's still typed by `SplitMethod`).
- [ ] **Step 2:** `npm run build`. **Commit:** `git commit -m "feat: hide shares split mode from the expense form (engine support kept)"`

---

### Task 4: SettleUpForm — From/To can't be the same person

**Files:**
- Create: `src/components/SettleUpForm.tsx`
- Modify: `src/app/groups/[id]/page.tsx` (replace the inline payment form)

- [ ] **Step 1:** Create `src/components/SettleUpForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";

type Member = { id: string; displayName: string };

/** Record-payment form; the To list excludes whoever is selected as From. */
export function SettleUpForm({
  action,
  members,
  hiddenFields,
}: {
  action: (formData: FormData) => void | Promise<void>;
  members: Member[];
  hiddenFields: Record<string, string>;
}) {
  const [from, setFrom] = useState(members[0]?.id ?? "");
  const toOptions = members.filter((m) => m.id !== from);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Field label="From">
        <Select
          name="from_member"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="To">
        {/* key={from} remounts so the default stays valid when From changes */}
        <Select name="to_member" key={from} defaultValue={toOptions[0]?.id}>
          {toOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount">
        <Input
          name="amount"
          inputMode="decimal"
          placeholder="10.00"
          required
          className="w-28"
        />
      </Field>
      <Button variant="secondary" className="shrink-0">
        Record payment
      </Button>
    </form>
  );
}
```

- [ ] **Step 2:** In `groups/[id]/page.tsx`: delete the inline `<form action={recordPaymentAction} ...>` block (From/To/Amount) and render instead:

```tsx
<SettleUpForm
  action={recordPaymentAction}
  members={memberOptions}
  hiddenFields={{ group_id: group.id }}
/>
```

(add the import; `memberOptions` already exists). The server-side same-person validation in `recordPaymentAction` STAYS — UI prevention plus server enforcement.
- [ ] **Step 3:** `npm run build`. **Commit:** `git commit -m "feat: settle-up form prevents paying yourself"`

---

### Task 5: Balances card — total spent + worded, colored rows; drop "placeholder" tag

**Files:**
- Modify: `src/app/groups/[id]/page.tsx`

- [ ] **Step 1:** Compute total spent (settlements are money movement, not spending):

```tsx
const totalSpentCents = expenses
  .filter((e) => !e.is_settlement)
  .reduce((acc, e) => acc + e.amount_cents, 0);
```

- [ ] **Step 2:** Replace the Balances card body with:

```tsx
<Card title="Balances">
  <div className="flex items-baseline justify-between gap-3 pb-2">
    <span className="text-sm font-semibold text-heading">Total spent</span>
    <span className="text-lg font-extrabold text-heading">
      {formatMoney(totalSpentCents, group.currency_code)}
    </span>
  </div>
  <div className="mb-1 border-t border-border" />
  {members.map((m) => {
    const net = balances.get(m.id) ?? 0;
    return (
      <StatRow
        key={m.id}
        label={m.display_name}
        value={
          net === 0 ? (
            <span className="font-medium text-muted">settled up</span>
          ) : net > 0 ? (
            <span className="text-success-ink">
              is owed {formatMoney(net, group.currency_code)}
            </span>
          ) : (
            <span className="text-danger">
              owes {formatMoney(-net, group.currency_code)}
            </span>
          )
        }
      />
    );
  })}
</Card>
```

(`text-success-ink` and `text-danger` are existing theme tokens — verify rendering visually in Task 11; if `success-ink` is too pale on the card background, use `text-emerald-600 dark:text-emerald-400`.)

- [ ] **Step 3:** In the Members card list, delete the `placeholder` tag span (`{m.user_id === null && (<span ...>placeholder</span>)}`) — the jargon confused the user and the distinction only matters on the join page, which already presents unclaimed names under "Is one of these you?".
- [ ] **Step 4:** `npm run build`. **Commit:** `git commit -m "feat: total spent and worded balances; drop placeholder jargon"`

---

### Task 6: Inline expense editing via `?edit=` (no separate page)

**Files:**
- Modify: `src/app/groups/[id]/page.tsx`
- Modify: `src/app/group-actions.ts` (updateExpenseAction error redirect)
- Delete: `src/app/groups/[id]/expenses/[expenseId]/page.tsx`

Clicking an expense now swaps the aside's "Add expense" card into an "Edit expense" card (same `ExpenseForm`), with Cancel and Delete. Pure server-component pattern — no new client state.

- [ ] **Step 1:** In `groups/[id]/page.tsx`, widen searchParams to `Promise<{ error?: string; edit?: string }>`, destructure `edit`, and resolve the target from the already-fetched list (no extra query):

```tsx
const editing =
  edit && z.uuid().safeParse(edit).success
    ? expenses.find((e) => e.id === edit)
    : undefined;
```

- [ ] **Step 2:** Build the form's initial values from `editing` (logic moved from the deleted edit page):

```tsx
let editingInitial;
if (editing) {
  const included: Record<string, boolean> = {};
  const values: Record<string, string> = {};
  for (const share of editing.expense_shares) {
    included[share.member_id] = true;
    if (editing.split_method === "exact") {
      values[share.member_id] = centsToMoneyString(share.share_cents);
    } else if (share.split_value !== null) {
      values[share.member_id] = String(share.split_value);
    }
  }
  editingInitial = {
    description: editing.description,
    amount: centsToMoneyString(editing.amount_cents),
    paidBy: editing.paid_by,
    expenseDate: editing.expense_date,
    splitMethod: editing.split_method,
    included,
    values,
  };
}
```

(import `centsToMoneyString` from `@/lib/money`, and `deleteExpenseAction`/`updateExpenseAction` from `@/app/group-actions`.)

- [ ] **Step 3:** Replace the aside's "Add expense" card with an add/edit switch. `key` forces a clean remount when switching targets:

```tsx
{editing ? (
  <Card title="Edit expense" highlight>
    <ExpenseForm
      key={editing.id}
      action={updateExpenseAction}
      members={memberOptions}
      defaultDate={editing.expense_date}
      submitLabel="Save changes"
      hiddenFields={{ group_id: group.id, expense_id: editing.id }}
      initial={editingInitial}
    />
    <div className="mt-3 flex items-center justify-between">
      <Link
        href={`/groups/${group.id}`}
        className="text-sm font-semibold text-muted hover:underline"
      >
        Cancel
      </Link>
      <form action={deleteExpenseAction}>
        <input type="hidden" name="group_id" value={group.id} />
        <input type="hidden" name="expense_id" value={editing.id} />
        <Button variant="danger" className="px-3 py-1.5 text-xs">
          Delete expense
        </Button>
      </form>
    </div>
  </Card>
) : (
  <Card title="Add expense">
    <ExpenseForm
      key="new"
      action={addExpenseAction}
      members={memberOptions}
      defaultDate={today}
      submitLabel="Add expense"
      hiddenFields={{ group_id: group.id }}
    />
  </Card>
)}
```

- [ ] **Step 4:** Expense list items: change `href` from `/groups/${group.id}/expenses/${e.id}` to `?edit=${e.id}` (relative query link keeps the path). Optionally highlight the row being edited (`e.id === editing?.id` → add `bg-black/5 dark:bg-white/5`).
- [ ] **Step 5:** In `group-actions.ts` `updateExpenseAction`: the parse-error redirect currently targets the deleted page (`editPath`). Change:

```ts
  if (!result.ok) {
    redirect(
      `${path}?edit=${ids.data.expense_id}&error=${encodeURIComponent(result.error)}`
    );
  }
```

(delete the now-unused `editPath` variable.)
- [ ] **Step 6:** Delete `src/app/groups/[id]/expenses/[expenseId]/page.tsx` (and the now-empty directories).
- [ ] **Step 7:** `npm test` + `npm run build` + `npm run lint`. **Commit:** `git commit -m "feat: inline expense editing in the aside via ?edit= param"`

---

### Task 7: Migration — anonymous actors (MANUAL APPLY — user)

**Files:**
- Create: `supabase/migrations/2026-06-11-optional-accounts.sql`

Anonymous expense writers have no auth uid, so `expenses.created_by` must allow NULL. (`groups.created_by` stays NOT NULL — creating a group still requires an account; the link is then shared.)

- [ ] **Step 1:** Write the migration:

```sql
-- Anonymous full access via invite link: expenses can be created by visitors
-- with no auth account, so created_by becomes nullable. NULL = "someone with
-- the invite link". groups.created_by stays NOT NULL (group creation still
-- requires an account).

alter table expenses alter column created_by drop not null;
```

- [ ] **Step 2:** Commit: `git commit -m "feat: migration — nullable expenses.created_by for anonymous actors"`
- [ ] **Step 3:** **PAUSE — hand to the user:** run the migration in Supabase dashboard → SQL Editor (paste the file, Run, expect "Success. No rows returned"). The user applies these quickly; continue with Task 8 while waiting, but Task 11's live smoke needs it applied.

---

### Task 8: db.ts — token-authorized write functions

**Files:**
- Modify: `src/lib/db.ts`

The token functions all follow the existing pattern: validate the token via `getGroupByInviteToken` (format-gated, admin client), constrain every statement to that group's id, return `{ error }` objects rather than throwing for expected failures. `ExpenseInput.createdBy` widens to `string | null`.

- [ ] **Step 1:** Change `ExpenseInput.createdBy: string` → `createdBy: string | null` (the RLS-path callers keep passing a string; the insert already passes the value through).

- [ ] **Step 2:** Append to the invite-token section of `db.ts`:

```ts
export type TokenGroupData = {
  group: GroupRow;
  members: MemberRow[];
  expenses: ExpenseRow[];
};

/** Full group data for the anonymous invite view. Token = read capability. */
export async function getGroupDataViaToken(
  token: string
): Promise<TokenGroupData | null> {
  const invite = await getGroupByInviteToken(token);
  if (!invite) return null;
  const { data, error } = await admin()
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .eq("group_id", invite.group.id)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return {
    group: invite.group,
    members: invite.members,
    expenses: data as unknown as ExpenseRow[],
  };
}

export async function addMemberViaToken(
  token: string,
  displayName: string
): Promise<TokenJoinResult> {
  const invite = await getGroupByInviteToken(token);
  if (!invite) return { error: "This invite link is invalid." };
  const { error } = await admin().from("group_members").insert({
    group_id: invite.group.id,
    display_name: displayName,
    user_id: null,
  });
  if (error) return { error: "Could not add that member. Please try again." };
  return { groupId: invite.group.id };
}

/** Token = write capability: expense ops validate the token, then constrain
 *  every statement to the token's group id. */
export async function createExpenseViaToken(
  token: string,
  input: Omit<ExpenseInput, "groupId">,
  shares: ShareInput[]
): Promise<TokenJoinResult> {
  const invite = await getGroupByInviteToken(token);
  if (!invite) return { error: "This invite link is invalid." };
  const expenseId = crypto.randomUUID();
  const { error } = await admin().from("expenses").insert({
    id: expenseId,
    group_id: invite.group.id,
    description: input.description,
    amount_cents: input.amountCents,
    paid_by: input.paidBy,
    split_method: input.splitMethod,
    is_settlement: input.isSettlement,
    expense_date: input.expenseDate,
    created_by: input.createdBy,
  });
  if (error) return { error: "Could not save the expense. Please try again." };
  const { error: sharesError } = await admin()
    .from("expense_shares")
    .insert(shares.map((s) => toShareRow(expenseId, s)));
  if (sharesError) {
    await admin().from("expenses").delete().eq("id", expenseId);
    return { error: "Could not save the expense. Please try again." };
  }
  return { groupId: invite.group.id };
}

export async function updateExpenseViaToken(
  token: string,
  expenseId: string,
  input: Omit<ExpenseInput, "groupId" | "isSettlement" | "createdBy">,
  shares: ShareInput[]
): Promise<TokenJoinResult> {
  const invite = await getGroupByInviteToken(token);
  if (!invite) return { error: "This invite link is invalid." };
  const { data, error } = await admin()
    .from("expenses")
    .update({
      description: input.description,
      amount_cents: input.amountCents,
      paid_by: input.paidBy,
      split_method: input.splitMethod,
      expense_date: input.expenseDate,
    })
    .eq("id", expenseId)
    .eq("group_id", invite.group.id) // token's group only
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: "That expense no longer exists." };
  }
  const { error: deleteError } = await admin()
    .from("expense_shares")
    .delete()
    .eq("expense_id", expenseId);
  if (deleteError) return { error: "Could not save the changes. Please try again." };
  const { error: insertError } = await admin()
    .from("expense_shares")
    .insert(shares.map((s) => toShareRow(expenseId, s)));
  if (insertError) return { error: "Could not save the changes. Please try again." };
  return { groupId: invite.group.id };
}

export async function deleteExpenseViaToken(
  token: string,
  expenseId: string
): Promise<TokenJoinResult> {
  const invite = await getGroupByInviteToken(token);
  if (!invite) return { error: "This invite link is invalid." };
  const { error } = await admin()
    .from("expenses")
    .delete()
    .eq("id", expenseId)
    .eq("group_id", invite.group.id);
  if (error) return { error: "Could not delete the expense. Please try again." };
  return { groupId: invite.group.id };
}
```

- [ ] **Step 3:** `npm run build` + `npm test`. **Commit:** `git commit -m "feat: token-authorized group data and expense writes in db layer"`

---

### Task 9: Token server actions

**Files:**
- Create: `src/app/token-actions.ts`

Mirrors of the member actions, authorized by the token instead of `requireUserId`. If a user happens to be signed in, stamp their uid on `created_by`; otherwise NULL. All redirects stay on `/g/<token>`.

- [ ] **Step 1:** Create `src/app/token-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addMemberViaToken,
  createExpenseViaToken,
  deleteExpenseViaToken,
  getGroupByInviteToken,
  updateExpenseViaToken,
} from "@/lib/db";
import { parseExpenseForm } from "@/lib/expense-input";
import { parseMoneyToCents } from "@/lib/money";
import { currentUserId } from "@/lib/supabase-auth";

const fail = (path: string, message: string) =>
  `${path}?error=${encodeURIComponent(message)}`;

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
const nameSchema = z.string().trim().min(1).max(80);

/** Validates the token + loads members, or redirects away. */
async function requireInvite(formData: FormData) {
  const token = tokenSchema.safeParse(formData.get("token"));
  if (!token.success) redirect("/");
  const invite = await getGroupByInviteToken(token.data);
  if (!invite) redirect("/");
  return { token: token.data, invite, path: `/g/${token.data}` };
}

export async function addMemberViaTokenAction(formData: FormData) {
  const { token, path } = await requireInvite(formData);
  const name = nameSchema.safeParse(formData.get("display_name"));
  if (!name.success) redirect(fail(path, "Member name is required."));
  const result = await addMemberViaToken(token, name.data);
  if ("error" in result) redirect(fail(path, result.error));
  revalidatePath(path);
  redirect(path);
}

export async function addExpenseViaTokenAction(formData: FormData) {
  const { token, invite, path } = await requireInvite(formData);
  const result = parseExpenseForm(
    formData,
    invite.members.map((m) => ({ id: m.id, displayName: m.display_name }))
  );
  if (!result.ok) redirect(fail(path, result.error));
  const outcome = await createExpenseViaToken(
    token,
    {
      description: result.expense.description,
      amountCents: result.expense.amountCents,
      paidBy: result.expense.paidBy,
      splitMethod: result.expense.splitMethod,
      isSettlement: false,
      expenseDate: result.expense.expenseDate,
      createdBy: await currentUserId(),
    },
    result.expense.shares.map((s) => ({
      memberId: s.memberId,
      shareCents: s.shareCents,
      splitValue: s.splitValue,
    }))
  );
  if ("error" in outcome) redirect(fail(path, outcome.error));
  revalidatePath(path);
  redirect(path);
}

export async function recordPaymentViaTokenAction(formData: FormData) {
  const { token, invite, path } = await requireInvite(formData);
  const parsed = z
    .object({
      from_member: z.uuid(),
      to_member: z.uuid(),
      amount: z.string(),
    })
    .safeParse({
      from_member: formData.get("from_member"),
      to_member: formData.get("to_member"),
      amount: formData.get("amount"),
    });
  if (!parsed.success) redirect(fail(path, "Invalid payment."));
  const { from_member, to_member, amount } = parsed.data;
  if (from_member === to_member) {
    redirect(fail(path, "Payer and payee must be different people."));
  }
  const amountCents = parseMoneyToCents(amount);
  if (amountCents === null || amountCents <= 0) {
    redirect(fail(path, "Enter a valid amount (e.g. 12.50)."));
  }
  const names = new Map(invite.members.map((m) => [m.id, m.display_name]));
  if (!names.has(from_member) || !names.has(to_member)) {
    redirect(fail(path, "Both people must be group members."));
  }
  const outcome = await createExpenseViaToken(
    token,
    {
      description: `${names.get(from_member)} paid ${names.get(to_member)}`,
      amountCents,
      paidBy: from_member,
      splitMethod: "exact",
      isSettlement: true,
      expenseDate: new Date().toISOString().slice(0, 10),
      createdBy: await currentUserId(),
    },
    [{ memberId: to_member, shareCents: amountCents, splitValue: amountCents }]
  );
  if ("error" in outcome) redirect(fail(path, outcome.error));
  revalidatePath(path);
  redirect(path);
}

export async function updateExpenseViaTokenAction(formData: FormData) {
  const { token, invite, path } = await requireInvite(formData);
  const expenseId = z.uuid().safeParse(formData.get("expense_id"));
  if (!expenseId.success) redirect(path);
  const result = parseExpenseForm(
    formData,
    invite.members.map((m) => ({ id: m.id, displayName: m.display_name }))
  );
  if (!result.ok) {
    redirect(`${path}?edit=${expenseId.data}&error=${encodeURIComponent(result.error)}`);
  }
  const outcome = await updateExpenseViaToken(
    token,
    expenseId.data,
    {
      description: result.expense.description,
      amountCents: result.expense.amountCents,
      paidBy: result.expense.paidBy,
      splitMethod: result.expense.splitMethod,
      expenseDate: result.expense.expenseDate,
    },
    result.expense.shares.map((s) => ({
      memberId: s.memberId,
      shareCents: s.shareCents,
      splitValue: s.splitValue,
    }))
  );
  if ("error" in outcome) redirect(fail(path, outcome.error));
  revalidatePath(path);
  redirect(path);
}

export async function deleteExpenseViaTokenAction(formData: FormData) {
  const { token, path } = await requireInvite(formData);
  const expenseId = z.uuid().safeParse(formData.get("expense_id"));
  if (!expenseId.success) redirect(path);
  const outcome = await deleteExpenseViaToken(token, expenseId.data);
  if ("error" in outcome) redirect(fail(path, outcome.error));
  revalidatePath(path);
  redirect(path);
}
```

- [ ] **Step 2:** `npm run build` + `npm test`. **Commit:** `git commit -m "feat: token-authorized server actions for anonymous group access"`

---

### Task 10: Shared GroupView + full anonymous invite page

**Files:**
- Create: `src/components/GroupView.tsx` (server component — the whole group UI, parameterized)
- Rewrite: `src/app/groups/[id]/page.tsx` (thin: fetch via RLS, render GroupView with member actions)
- Rewrite: `src/app/g/[inviteToken]/page.tsx` (thin: fetch via token, render claim card + GroupView with token actions)

**Approach:** `GroupView` receives data + an `actions` bundle + `hiddenFields` + `basePath`, and contains everything Tasks 4–6 built (total-spent balances, SettleUpForm, inline `?edit=`, expense list with `?edit=` links, members card, CopyLinkButton header). The two pages become data-fetching wrappers. This task ABSORBS the Task 4–6 group-page edits into GroupView — extract, don't duplicate: move the JSX from `groups/[id]/page.tsx` into GroupView and parameterize these points:

```ts
// GroupView props
export type GroupViewActions = {
  addExpense: (formData: FormData) => void | Promise<void>;
  updateExpense: (formData: FormData) => void | Promise<void>;
  deleteExpense: (formData: FormData) => void | Promise<void>;
  recordPayment: (formData: FormData) => void | Promise<void>;
  addMember: (formData: FormData) => void | Promise<void>;
};

export function GroupView({
  group,            // GroupRow
  members,          // MemberRow[]
  expenses,         // ExpenseRow[]
  actions,          // GroupViewActions
  hiddenFields,     // { group_id } (member mode) or { token } (token mode)
  basePath,         // "/groups/<id>" or "/g/<token>"
  editingId,        // sanitized ?edit= value or undefined
  error,            // searchParams.error
  inviteUrl,        // absolute /g/<token> URL for CopyLinkButton
  topCards,         // ReactNode — token mode injects the claim/join cards above the view
}: { ... }): JSX.Element
```

Parameterized points inside (everything else is the Task 4–6 JSX verbatim):
- Every form's hidden fields come from `hiddenFields` (the ExpenseForm/SettleUpForm props already accept this; the add-member and delete forms render `Object.entries(hiddenFields)` plus their own fields instead of a hardcoded `group_id` input).
- Expense links and Cancel link use `basePath` (`${basePath}?edit=${e.id}`, cancel → `basePath`).
- `editing = editingId ? expenses.find((e) => e.id === editingId) : undefined`.
- `{topCards}` renders first when provided.

- [ ] **Step 1:** Create `GroupView.tsx` by moving the group-page JSX + helpers (`ledger` mapping, `balances`, `transfers`, `nameOf`, `totalSpentCents`, `editingInitial` builder, `today`) into it, parameterized as above. It imports the engine, money helpers, and UI components — but NO actions and NO db functions (they arrive via props/data).
- [ ] **Step 2:** Rewrite `src/app/groups/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import {
  addExpenseAction,
  addMemberAction,
  deleteExpenseAction,
  recordPaymentAction,
  updateExpenseAction,
} from "@/app/group-actions";
import { AuthNav } from "@/components/AuthNav";
import { GroupView } from "@/components/GroupView";
import { PageShell } from "@/components/ui";
import { getGroup, listExpenses, listMembers } from "@/lib/db";
import { currentUserId } from "@/lib/supabase-auth";

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  const { id } = await params;
  const { error, edit } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const userId = await currentUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/groups/${id}`)}`);

  const group = await getGroup(id);
  if (!group) notFound();
  const members = await listMembers(id);
  const expenses = await listExpenses(id);

  return (
    <PageShell
      headerRight={<AuthNav />}
      aside={null /* GroupView owns the layout; see Step 3 note */}
    >
      <GroupView
        group={group}
        members={members}
        expenses={expenses}
        actions={{
          addExpense: addExpenseAction,
          updateExpense: updateExpenseAction,
          deleteExpense: deleteExpenseAction,
          recordPayment: recordPaymentAction,
          addMember: addMemberAction,
        }}
        hiddenFields={{ group_id: group.id }}
        basePath={`/groups/${group.id}`}
        editingId={edit && z.uuid().safeParse(edit).success ? edit : undefined}
        error={error}
        inviteUrl={`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/g/${group.invite_token}`}
      />
    </PageShell>
  );
}
```

**Layout note (Step 3 resolves this):** PageShell's `aside` prop conflicts with GroupView owning both columns. Resolution: GroupView returns a fragment `{main, aside}` is not possible — instead give GroupView an `aside` RENDER SLOT: GroupView exports TWO components, `GroupViewMain` and `GroupViewAside`, sharing a computed-props helper — OR simpler and preferred: **GroupView renders the PageShell itself** (it takes a `headerRight` prop and passes `aside` internally). Then the pages render `<GroupView headerRight={<AuthNav />} ... />` with no outer PageShell. Choose this; adjust the page code above accordingly (drop the PageShell wrapper, pass `headerRight={<AuthNav />}` and `topCards` as props).

- [ ] **Step 3:** Rewrite `src/app/g/[inviteToken]/page.tsx`: fetch `getGroupDataViaToken(inviteToken)` (notFound on null). If a signed-in user is already a member, `redirect(`/groups/${group.id}`)` (members use the canonical RLS view). Otherwise render `<GroupView ...>` in token mode:
  - `actions` = the five token actions; `hiddenFields={{ token: inviteToken }}`; `basePath={`/g/${inviteToken}`}`; `inviteUrl` = same absolute URL.
  - `topCards` = the existing claim/join cards, reworded to make accounts optional: signed-out → one Card: "**You can use this page without an account.** Add expenses below. If you want this group on your own dashboard, log in / register" (links keep `?next=`). Signed-in non-member → the existing "Is one of these you?" claim card + "Join as a new member" card.
  - The join/claim ACTIONS (`claimMemberAction`, `joinGroupAction` from group-actions) are unchanged.
- [ ] **Step 4:** Check for stragglers: `Grep "expenses/" src/app` — no link should target the deleted edit-page route. `npm test` + `npm run build` + `npm run lint`.
- [ ] **Step 5:** **Commit:** `git commit -m "feat: anonymous full access — shared GroupView on invite link"`

---

### Task 11: End-to-end verification

- [ ] **Step 1:** Automated: `npm test` (58 tests — no unit-level changes expected beyond compile), `npm run lint`, `npm run build`.
- [ ] **Step 2:** Live smoke (dev server, real Supabase; smoke accounts `chiyang+smoketest1@tatsu.works` / `smoketest-pw-123`, group "Phase2 Smoke" exists with invite token; Task 7's migration must be applied):
  1. Header shows "💸 Wisely Split" everywhere; tab title "Wisely Split".
  2. Create group: currency defaults to RM, label "Currency label"; typing `RM` works (no 3-letter complaint); amounts render "RM 12.34".
  3. Register page: password input has no dot placeholder.
  4. Balances card: "Total spent RM X" on top; rows read "X is owed RM …" (green) / "Y owes RM …" (red) / "settled up" (muted). No "placeholder" tag in members card.
  5. Split dropdown shows Equally / Exact amounts / Percentages — no Shares.
  6. Settle up: selecting a From removes that person from To (and the server still rejects a crafted same-person POST with the friendly error).
  7. Click an expense → aside swaps to "Edit expense" with prefilled values; Cancel restores Add; Save updates balances; Delete removes. Old `/groups/<id>/expenses/<id>` URL → 404.
  8. **Anonymous flow (the headline):** open `/g/<token>` in a clean session (no cookies): full group view renders; add an expense anonymously → appears, balances update, `created_by` is NULL in the DB; record a payment; add a member; edit an expense inline. The "optional account" copy shows. Then sign in as a member and confirm `/g/<token>` redirects to `/groups/<id>`.
  9. Negative: `/g/garbage` → 404; forged token POST to a token action → redirected away with no write (verify via the group's expense list).
- [ ] **Step 3:** Final code review of the whole branch (controller dispatches reviewer), then merge per the finishing-a-development-branch options.

---

### Task 12: Keepalive + backup cron route

**Files:**
- Create: `src/app/api/cron/backup/route.ts`
- Create: `vercel.json`
- Already done (2026-06-10, committed separately): `.env.local.example` documents the three new vars; the real values are in the local **gitignored** `.env.local` — `CRON_SECRET` (generated), `GITHUB_BACKUP_TOKEN` (user's fine-grained PAT — **NEVER commit it; never echo it into any tracked file or log**), `GITHUB_BACKUP_REPO=TanCy96/wisely-split-backups` (private repo; token's contents access verified live).

One daily job, two purposes (design spec §Keepalive + backup): the table reads count as Supabase activity (prevents the ~7-day free-tier pause), and the snapshot lands as a commit in the private GitHub repo (versioned history with diffs). Logical backup only — schema restoration comes from `supabase/migrations/`; restore = run migrations on a fresh project, then insert the JSON rows with the service-role key (auth.users must be re-created first; expense `created_by` references them).

- [ ] **Step 1: Write `src/app/api/cron/backup/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const TABLES = ["groups", "group_members", "expenses", "expense_shares"] as const;
const BACKUP_PATH = "data/backup.json";
const MAX_ROWS = 50_000; // far above group-scale data; loud failure if ever hit

/**
 * Daily keepalive + logical backup. Vercel cron invokes this with
 * "Authorization: Bearer ${CRON_SECRET}" (sent automatically when the env var
 * is set on the project). Reads all four tables with the service-role key and
 * upserts a JSON snapshot into the private GitHub backup repo via the
 * contents API — one file, so git history is the version timeline.
 */
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(0, MAX_ROWS - 1);
    if (error) {
      return new NextResponse(`Supabase read failed (${table}): ${error.message}`, {
        status: 502,
      });
    }
    if (data.length >= MAX_ROWS) {
      return new NextResponse(`Backup aborted: ${table} hit the ${MAX_ROWS} row cap`, {
        status: 507,
      });
    }
    tables[table] = data;
  }

  const snapshot = JSON.stringify(
    { exported_at: new Date().toISOString(), tables },
    null,
    2
  );

  const repo = process.env.GITHUB_BACKUP_REPO;
  const githubHeaders = {
    Authorization: `Bearer ${process.env.GITHUB_BACKUP_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "wisely-split-backup",
  };
  const contentsUrl = `https://api.github.com/repos/${repo}/contents/${BACKUP_PATH}`;

  // Upserting needs the current file sha (absent on first run).
  const existing = await fetch(contentsUrl, { headers: githubHeaders });
  const sha = existing.ok
    ? ((await existing.json()) as { sha: string }).sha
    : undefined;

  const put = await fetch(contentsUrl, {
    method: "PUT",
    headers: githubHeaders,
    body: JSON.stringify({
      message: `backup ${new Date().toISOString().slice(0, 10)}`,
      content: Buffer.from(snapshot).toString("base64"),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!put.ok) {
    return new NextResponse(`GitHub commit failed: ${put.status}`, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    rows: Object.fromEntries(
      Object.entries(tables).map(([t, rows]) => [t, rows.length])
    ),
  });
}
```

- [ ] **Step 2: Create `vercel.json`** (daily at 01:00 UTC = 09:00 SGT):

```json
{
  "crons": [
    {
      "path": "/api/cron/backup",
      "schedule": "0 1 * * *"
    }
  ]
}
```

- [ ] **Step 3:** `npm run build` → route appears as `ƒ /api/cron/backup`. **Commit** (both files): `git commit -m "feat: daily keepalive + GitHub backup cron"` — double-check with `git diff --cached` that NO token value is in the diff before committing.

---

### Task 13: Verify the backup live (local)

- [ ] **Step 1:** `npm run dev`, then (PowerShell reads the secret from .env.local so it never lands in the plan):

```powershell
$secret = ((Get-Content .env.local | Where-Object { $_ -match '^CRON_SECRET=' }) -replace '^CRON_SECRET=','')
curl.exe -s -w "`n%{http_code}" -H "Authorization: Bearer $secret" http://localhost:3000/api/cron/backup
```

Expected: `{"ok":true,"rows":{"groups":N,...}}` and `200`.
- [ ] **Step 2:** Probes: no Authorization header → 401; wrong bearer → 401. Re-run the valid call → still 200 (sha-based upsert works on the second write).
- [ ] **Step 3:** Confirm the commit landed: `https://github.com/TanCy96/wisely-split-backups/commits` shows "backup YYYY-MM-DD" and `data/backup.json` contains the four tables.

---

### Task 14: Deploy to Vercel (MANUAL — user, with assistant checklist)

- [ ] **Step 1:** Vercel: import the GitHub repo `TanCy96/wisely-split` (push `main` first — pushes happen only on user request), framework Next.js, region Singapore (sin1) to sit next to the Supabase project.
- [ ] **Step 2:** Project env vars (Production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `GITHUB_BACKUP_TOKEN`, `GITHUB_BACKUP_REPO`, and `NEXT_PUBLIC_BASE_URL=https://<prod-domain>`.
- [ ] **Step 3:** Supabase Auth (the known smash-kaki gotcha): Site URL → production domain; add `https://<prod-domain>/auth/callback` to the redirect allowlist (keep the localhost entries for dev).
- [ ] **Step 4:** After first deploy: confirm the cron appears under Vercel → Settings → Cron Jobs, then trigger it once from the dashboard (or wait for 01:00 UTC) and check the backup repo for a fresh commit.
- [ ] **Step 5:** Production smoke: register/login on the prod domain, create a group, add an expense, open the invite link in a private window.

---

## Out of scope

Nothing — this plan now covers feedback round 1 AND Phase 3 (cron + deploy). The smoke data ("Phase2 Smoke" group, smoketest accounts) stays as demo data.

## Resolved questions (user answered 2026-06-10 — no open questions remain)

- **Anonymous access gets FULL write capability** (add, edit, delete, settle, add members) — confirmed by the user. Build Tasks 7–10 exactly as specified; no read-only or add-only variant.
- **Dashboard stays account-only** — confirmed. Anonymous users cannot see "their groups"; they keep/bookmark their `/g/<token>` links. No anonymous group list of any kind.
