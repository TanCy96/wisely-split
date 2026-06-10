# wisely-split Phase 2 Implementation Plan — Groups, Expenses, Invites

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The working product: dashboard, group detail with balances/settle-ups/expenses, expense edit/delete, and the invite-link join/claim flow.

**Architecture:** Pages are Server Components reading through `src/lib/db.ts`. Member operations use the **RLS-scoped session client** (`serverAuth()`), so the Phase 1 policies are the enforcement; invite-token flows use a **service-role admin client** where the token is the authorization (per spec §Security). Mutations are Server Actions validated with Zod; expense input is converted to exact cents by the Phase 1 engine (`computeShares`), and balances/settle-ups are computed at render time (`computeBalances`, `simplifyDebts`). Where RLS would hide `INSERT ... RETURNING` (group creation before self-membership exists), IDs are app-generated with `crypto.randomUUID()`.

**Tech Stack:** Next.js 15 App Router, React 19, Zod 4, Supabase JS (`serverAuth` session client + service-role client), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-wisely-split-design.md`. Phase 1 (merged): engine, schema+RLS, auth, UI kit.

**Conventions (from Phase 1 / user prefs):**
- Work from `D:\Projects\wisely-split` (Windows, PowerShell), branch off `main`.
- **Commit at the end of every task** (and every TDD cycle).
- Errors surface via `redirect("path?error=...")` + `<Alert tone="danger">` (auth-pages pattern).
- Run the suite once per change; don't re-run when nothing changed.

**Component APIs available (Phase 1, do not modify):** `PageShell {children, aside?, headerRight?, narrow?}`, `Card {title?, children, highlight?}`, `Field {label, error?, children}` + `Input/Select/Textarea` (native props), `Button {variant?: primary|secondary|danger|ghost}`, `StatRow {label, value}`, `Alert {tone}`, `CopyLinkButton {url, label}`, `AuthNav` (no props). Engine: `computeShares(method, amountCents, participants)` → `ComputedShare[]` (throws `SplitError`), `computeBalances(memberIds, ledgerExpenses)` → `Map<string, number>`, `simplifyDebts(balances)` → `SuggestedTransfer[]`.

---

### Task 1: Money parsing/formatting — `src/lib/money.ts` (TDD)

**Files:**
- Create: `src/lib/money.ts`
- Test: `src/lib/money.test.ts`

String-math money parsing (no floats). `parseMoneyToCents` returns `null` for malformed input and accepts `0` (callers decide whether zero is allowed — exact splits permit 0, amounts don't).

- [ ] **Step 1: Write failing tests** — create `src/lib/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { centsToMoneyString, formatMoney, parseMoneyToCents } from "./money";

describe("parseMoneyToCents", () => {
  it("parses dollars and cents", () => {
    expect(parseMoneyToCents("12.34")).toBe(1234);
    expect(parseMoneyToCents("0.01")).toBe(1);
    expect(parseMoneyToCents("999999.99")).toBe(99999999);
  });

  it("parses whole dollars and single decimals", () => {
    expect(parseMoneyToCents("12")).toBe(1200);
    expect(parseMoneyToCents("12.3")).toBe(1230);
  });

  it("accepts zero and trims whitespace", () => {
    expect(parseMoneyToCents("0")).toBe(0);
    expect(parseMoneyToCents(" 5 ")).toBe(500);
  });

  it("rejects malformed input", () => {
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("-5")).toBeNull();
    expect(parseMoneyToCents("12.345")).toBeNull();
    expect(parseMoneyToCents("1,000")).toBeNull();
    expect(parseMoneyToCents("12.")).toBeNull();
    expect(parseMoneyToCents("1000000")).toBeNull(); // over the cap
  });
});

describe("centsToMoneyString", () => {
  it("renders cents as a money input string", () => {
    expect(centsToMoneyString(1234)).toBe("12.34");
    expect(centsToMoneyString(5)).toBe("0.05");
    expect(centsToMoneyString(0)).toBe("0.00");
    expect(centsToMoneyString(-50)).toBe("-0.50");
  });
});

describe("formatMoney", () => {
  it("prefixes the currency code", () => {
    expect(formatMoney(2500, "SGD")).toBe("SGD 25.00");
    expect(formatMoney(-1, "SGD")).toBe("SGD -0.01");
  });
});
```

- [ ] **Step 2:** Run `npm test` → FAIL (cannot find module './money').

- [ ] **Step 3: Implement** — create `src/lib/money.ts`:

```ts
// $999,999.99 — comfortably under the schema's integer-cents column range.
const MAX_CENTS = 99_999_999;

/**
 * Parse a user-typed money string ("12.50", "12", "12.5") into integer cents
 * using string math — no float rounding. Returns null for malformed input.
 * Zero is valid here; callers that need a positive amount check separately.
 */
export function parseMoneyToCents(input: string): number | null {
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const cents =
    Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
  return cents > MAX_CENTS ? null : cents;
}

/** 1234 → "12.34" (the inverse of parseMoneyToCents, for form redisplay). */
export function centsToMoneyString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Display form: "SGD 25.00". */
export function formatMoney(cents: number, currencyCode: string): string {
  return `${currencyCode} ${centsToMoneyString(cents)}`;
}
```

- [ ] **Step 4:** Run `npm test` → all green.
- [ ] **Step 5: Commit:** `git add src/lib/money.ts src/lib/money.test.ts; git commit -m "feat: money parsing and formatting in integer cents"`

---

### Task 2: Expense form parsing — `src/lib/expense-input.ts` (TDD)

**Files:**
- Create: `src/lib/expense-input.ts`
- Test: `src/lib/expense-input.test.ts`

Pure function: `FormData` + group members → Zod-validated expense fields + engine-computed shares. Used by both add and update actions. Form field contract (shared with the `ExpenseForm` component in Task 5): `description`, `amount`, `paid_by`, `expense_date`, `split_method`, plus per member `participant_<memberId>` (checkbox; present = included) and `value_<memberId>` (cents string for `exact`, plain number for `percent`/`shares`; absent for `equal`).

- [ ] **Step 1: Write failing tests** — create `src/lib/expense-input.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseExpenseForm } from "./expense-input";

const members = [
  { id: "11111111-1111-4111-8111-111111111111", displayName: "Ana" },
  { id: "22222222-2222-4222-8222-222222222222", displayName: "Ben" },
  { id: "33333333-3333-4333-8333-333333333333", displayName: "Cleo" },
];
const [ana, ben, cleo] = members;

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const base = {
  description: "Dinner",
  amount: "30.00",
  paid_by: ana.id,
  expense_date: "2026-06-10",
};

describe("parseExpenseForm — equal", () => {
  it("computes equal shares for the checked members", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        split_method: "equal",
        [`participant_${ana.id}`]: "on",
        [`participant_${ben.id}`]: "on",
      }),
      members
    );
    expect(result).toEqual({
      ok: true,
      expense: {
        description: "Dinner",
        amountCents: 3000,
        paidBy: ana.id,
        expenseDate: "2026-06-10",
        splitMethod: "equal",
        shares: [
          { memberId: ana.id, shareCents: 1500, splitValue: null },
          { memberId: ben.id, shareCents: 1500, splitValue: null },
        ],
      },
    });
  });

  it("rejects when nobody is checked", () => {
    const result = parseExpenseForm(form({ ...base, split_method: "equal" }), members);
    expect(result).toEqual({
      ok: false,
      error: "Choose at least one person to split with.",
    });
  });
});

describe("parseExpenseForm — exact", () => {
  it("parses money values per member", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        split_method: "exact",
        [`participant_${ana.id}`]: "on",
        [`participant_${cleo.id}`]: "on",
        [`value_${ana.id}`]: "10.00",
        [`value_${cleo.id}`]: "20.00",
      }),
      members
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.expense.shares).toEqual([
        { memberId: ana.id, shareCents: 1000, splitValue: 1000 },
        { memberId: cleo.id, shareCents: 2000, splitValue: 2000 },
      ]);
    }
  });

  it("surfaces engine errors when amounts do not sum to the total", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        split_method: "exact",
        [`participant_${ana.id}`]: "on",
        [`participant_${ben.id}`]: "on",
        [`value_${ana.id}`]: "10.00",
        [`value_${ben.id}`]: "10.00",
      }),
      members
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/add up to the total/);
  });

  it("requires a value for every checked member", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        split_method: "exact",
        [`participant_${ana.id}`]: "on",
        [`participant_${ben.id}`]: "on",
        [`value_${ana.id}`]: "30.00",
      }),
      members
    );
    expect(result).toEqual({ ok: false, error: "Enter a value for Ben." });
  });
});

describe("parseExpenseForm — percent and shares", () => {
  it("parses plain numbers for percent", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        split_method: "percent",
        [`participant_${ana.id}`]: "on",
        [`participant_${ben.id}`]: "on",
        [`value_${ana.id}`]: "25",
        [`value_${ben.id}`]: "75",
      }),
      members
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.expense.shares).toEqual([
        { memberId: ana.id, shareCents: 750, splitValue: 25 },
        { memberId: ben.id, shareCents: 2250, splitValue: 75 },
      ]);
    }
  });

  it("parses weights for shares", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        amount: "1.00",
        split_method: "shares",
        [`participant_${ana.id}`]: "on",
        [`participant_${ben.id}`]: "on",
        [`value_${ana.id}`]: "2",
        [`value_${ben.id}`]: "1",
      }),
      members
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.expense.shares.map((s) => s.shareCents)).toEqual([67, 33]);
    }
  });

  it("rejects garbage values", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        split_method: "percent",
        [`participant_${ana.id}`]: "on",
        [`value_${ana.id}`]: "abc",
      }),
      members
    );
    expect(result).toEqual({ ok: false, error: "Invalid value for Ana." });
  });
});

describe("parseExpenseForm — field validation", () => {
  it("rejects a missing description", () => {
    const result = parseExpenseForm(
      form({ ...base, description: "  ", split_method: "equal", [`participant_${ana.id}`]: "on" }),
      members
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a zero or malformed amount", () => {
    for (const amount of ["0", "abc", "-5"]) {
      const result = parseExpenseForm(
        form({ ...base, amount, split_method: "equal", [`participant_${ana.id}`]: "on" }),
        members
      );
      expect(result).toEqual({ ok: false, error: "Enter a valid amount (e.g. 12.50)." });
    }
  });

  it("rejects a payer who is not a group member", () => {
    const result = parseExpenseForm(
      form({
        ...base,
        paid_by: "99999999-9999-4999-8999-999999999999",
        split_method: "equal",
        [`participant_${ana.id}`]: "on",
      }),
      members
    );
    expect(result).toEqual({ ok: false, error: "The payer must be a group member." });
  });

  it("rejects a malformed date", () => {
    const result = parseExpenseForm(
      form({ ...base, expense_date: "10/06/2026", split_method: "equal", [`participant_${ana.id}`]: "on" }),
      members
    );
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2:** Run `npm test` → FAIL (cannot find module './expense-input').

- [ ] **Step 3: Implement** — create `src/lib/expense-input.ts`:

```ts
import { z } from "zod";
import { parseMoneyToCents } from "./money";
import {
  computeShares,
  SplitError,
  type ComputedShare,
  type SplitMethod,
  type SplitParticipant,
} from "./splits";

export type ExpenseFormMember = { id: string; displayName: string };

export type ParsedExpense = {
  description: string;
  amountCents: number;
  paidBy: string;
  expenseDate: string;
  splitMethod: SplitMethod;
  shares: ComputedShare[];
};

export type ParseExpenseResult =
  | { ok: true; expense: ParsedExpense }
  | { ok: false; error: string };

const fieldsSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Description is required.")
    .max(200, "Description is too long."),
  amount: z.string(),
  paid_by: z.uuid(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."),
  split_method: z.enum(["equal", "exact", "percent", "shares"]),
});

/**
 * Convert the expense form (see ExpenseForm component for the field contract)
 * into validated fields plus engine-computed shares. Pure — testable without
 * a DB; the caller persists the result.
 */
export function parseExpenseForm(
  formData: FormData,
  members: ExpenseFormMember[]
): ParseExpenseResult {
  const parsed = fieldsSchema.safeParse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    paid_by: formData.get("paid_by"),
    expense_date: formData.get("expense_date"),
    split_method: formData.get("split_method"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { description, amount, paid_by, expense_date, split_method } = parsed.data;

  const amountCents = parseMoneyToCents(amount);
  if (amountCents === null || amountCents <= 0) {
    return { ok: false, error: "Enter a valid amount (e.g. 12.50)." };
  }
  if (!members.some((m) => m.id === paid_by)) {
    return { ok: false, error: "The payer must be a group member." };
  }

  const participants: SplitParticipant[] = [];
  for (const member of members) {
    if (formData.get(`participant_${member.id}`) === null) continue;
    if (split_method === "equal") {
      participants.push({ memberId: member.id, value: null });
      continue;
    }
    const raw = String(formData.get(`value_${member.id}`) ?? "").trim();
    if (raw === "") {
      return { ok: false, error: `Enter a value for ${member.displayName}.` };
    }
    const value = split_method === "exact" ? parseMoneyToCents(raw) : Number(raw);
    if (value === null || !Number.isFinite(value) || value < 0) {
      return { ok: false, error: `Invalid value for ${member.displayName}.` };
    }
    participants.push({ memberId: member.id, value });
  }
  if (participants.length === 0) {
    return { ok: false, error: "Choose at least one person to split with." };
  }

  try {
    const shares = computeShares(split_method, amountCents, participants);
    return {
      ok: true,
      expense: {
        description,
        amountCents,
        paidBy: paid_by,
        expenseDate: expense_date,
        splitMethod: split_method,
        shares,
      },
    };
  } catch (error) {
    if (error instanceof SplitError) return { ok: false, error: error.message };
    throw error;
  }
}
```

- [ ] **Step 4:** Run `npm test` → all green.
- [ ] **Step 5: Commit:** `git add src/lib/expense-input.ts src/lib/expense-input.test.ts; git commit -m "feat: expense form parsing with engine-computed shares"`

---

### Task 3: Query layer — `src/lib/db.ts`

**Files:**
- Create: `src/lib/db.ts`

No unit tests (thin I/O over Supabase; behavior verified live in Task 8). Two client kinds, per spec §Security:
- **RLS-scoped** (`serverAuth()` session client): all member operations — policies do the filtering, so e.g. `listGroupsForUser` needs no explicit `where user…` and non-members read empty sets.
- **Service-role admin client**: invite-token functions ONLY — the validated token is the authorization (claiming/joining happens before the user satisfies the membership policies). Never imported by client components (Server Actions/Components only).

- [ ] **Step 1: Write `src/lib/db.ts`** — exactly:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverAuth } from "./supabase-auth";
import { generateToken } from "./tokens";
import type { SplitMethod } from "./splits";

/* ---------- Row types (snake_case as stored; money in integer cents) ---------- */

export type GroupRow = {
  id: string;
  name: string;
  currency_code: string;
  invite_token: string;
  created_by: string;
  created_at: string;
};

export type MemberRow = {
  id: string;
  group_id: string;
  display_name: string;
  user_id: string | null;
  created_at: string;
};

export type ShareRow = {
  id: string;
  expense_id: string;
  member_id: string;
  share_cents: number;
  split_value: number | null;
};

export type ExpenseRow = {
  id: string;
  group_id: string;
  description: string;
  amount_cents: number;
  paid_by: string;
  split_method: SplitMethod;
  is_settlement: boolean;
  expense_date: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  expense_shares: ShareRow[];
};

export type ExpenseInput = {
  groupId: string;
  description: string;
  amountCents: number;
  paidBy: string;
  splitMethod: SplitMethod;
  isSettlement: boolean;
  expenseDate: string;
  createdBy: string;
};

export type ShareInput = {
  memberId: string;
  shareCents: number;
  splitValue: number | null;
};

const GROUP_COLUMNS = "id, name, currency_code, invite_token, created_by, created_at";
const MEMBER_COLUMNS = "id, group_id, display_name, user_id, created_at";
const EXPENSE_COLUMNS =
  "id, group_id, description, amount_cents, paid_by, split_method, is_settlement, " +
  "expense_date, created_by, created_at, updated_at, " +
  "expense_shares (id, expense_id, member_id, share_cents, split_value)";

/* ---------- Member operations (RLS-scoped session client) ---------- */

export async function listGroupsForUser(): Promise<GroupRow[]> {
  const supabase = await serverAuth();
  const { data, error } = await supabase
    .from("groups")
    .select(GROUP_COLUMNS)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

export async function getGroup(groupId: string): Promise<GroupRow | null> {
  const supabase = await serverAuth();
  const { data, error } = await supabase
    .from("groups")
    .select(GROUP_COLUMNS)
    .eq("id", groupId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createGroup(input: {
  name: string;
  currencyCode: string;
  userId: string;
  displayName: string;
}): Promise<string> {
  const supabase = await serverAuth();
  // App-generated id: the creator is not a member yet when this row is
  // inserted, so the SELECT policy would hide an INSERT ... RETURNING.
  const groupId = crypto.randomUUID();
  const { error } = await supabase.from("groups").insert({
    id: groupId,
    name: input.name,
    currency_code: input.currencyCode,
    invite_token: generateToken(),
    created_by: input.userId,
  });
  if (error) throw new Error(error.message);
  const { error: memberError } = await supabase.from("group_members").insert({
    group_id: groupId,
    display_name: input.displayName,
    user_id: input.userId,
  });
  if (memberError) throw new Error(memberError.message);
  return groupId;
}

export async function listMembers(groupId: string): Promise<MemberRow[]> {
  const supabase = await serverAuth();
  const { data, error } = await supabase
    .from("group_members")
    .select(MEMBER_COLUMNS)
    .eq("group_id", groupId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

export async function addPlaceholderMember(
  groupId: string,
  displayName: string
): Promise<void> {
  const supabase = await serverAuth();
  const { error } = await supabase.from("group_members").insert({
    group_id: groupId,
    display_name: displayName,
    user_id: null,
  });
  if (error) throw new Error(error.message);
}

export async function listExpenses(groupId: string): Promise<ExpenseRow[]> {
  const supabase = await serverAuth();
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .eq("group_id", groupId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getExpense(expenseId: string): Promise<ExpenseRow | null> {
  const supabase = await serverAuth();
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .eq("id", expenseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createExpense(
  input: ExpenseInput,
  shares: ShareInput[]
): Promise<void> {
  const supabase = await serverAuth();
  const expenseId = crypto.randomUUID();
  const { error } = await supabase.from("expenses").insert({
    id: expenseId,
    group_id: input.groupId,
    description: input.description,
    amount_cents: input.amountCents,
    paid_by: input.paidBy,
    split_method: input.splitMethod,
    is_settlement: input.isSettlement,
    expense_date: input.expenseDate,
    created_by: input.createdBy,
  });
  if (error) throw new Error(error.message);
  const { error: sharesError } = await supabase
    .from("expense_shares")
    .insert(shares.map((s) => toShareRow(expenseId, s)));
  if (sharesError) {
    // Two statements, no transaction (supabase-js limitation): best-effort
    // rollback so a failed shares insert doesn't leave a shareless expense
    // skewing balances.
    await supabase.from("expenses").delete().eq("id", expenseId);
    throw new Error(sharesError.message);
  }
}

export async function updateExpense(
  expenseId: string,
  input: Omit<ExpenseInput, "groupId" | "isSettlement" | "createdBy">,
  shares: ShareInput[]
): Promise<void> {
  const supabase = await serverAuth();
  const { error } = await supabase
    .from("expenses")
    .update({
      description: input.description,
      amount_cents: input.amountCents,
      paid_by: input.paidBy,
      split_method: input.splitMethod,
      expense_date: input.expenseDate,
    })
    .eq("id", expenseId);
  if (error) throw new Error(error.message);
  const { error: deleteError } = await supabase
    .from("expense_shares")
    .delete()
    .eq("expense_id", expenseId);
  if (deleteError) throw new Error(deleteError.message);
  const { error: insertError } = await supabase
    .from("expense_shares")
    .insert(shares.map((s) => toShareRow(expenseId, s)));
  if (insertError) throw new Error(insertError.message);
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const supabase = await serverAuth();
  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) throw new Error(error.message);
}

function toShareRow(expenseId: string, share: ShareInput) {
  return {
    expense_id: expenseId,
    member_id: share.memberId,
    share_cents: share.shareCents,
    split_value: share.splitValue,
  };
}

/* ---------- Invite-token flows (service role; the token is the authorization) ---------- */

let cachedAdmin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!cachedAdmin) {
    cachedAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return cachedAdmin;
}

export type InviteView = { group: GroupRow; members: MemberRow[] };

export async function getGroupByInviteToken(
  token: string
): Promise<InviteView | null> {
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return null;
  const { data: group, error } = await admin()
    .from("groups")
    .select(GROUP_COLUMNS)
    .eq("invite_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!group) return null;
  const { data: members, error: membersError } = await admin()
    .from("group_members")
    .select(MEMBER_COLUMNS)
    .eq("group_id", group.id)
    .order("created_at");
  if (membersError) throw new Error(membersError.message);
  return { group, members };
}

export type TokenJoinResult = { groupId: string } | { error: string };

export async function claimMemberViaToken(
  token: string,
  memberId: string,
  userId: string
): Promise<TokenJoinResult> {
  const invite = await getGroupByInviteToken(token);
  if (!invite) return { error: "This invite link is invalid." };
  if (invite.members.some((m) => m.user_id === userId)) {
    return { error: "You are already a member of this group." };
  }
  const member = invite.members.find((m) => m.id === memberId);
  if (!member || member.user_id !== null) {
    return { error: "That name has already been claimed." };
  }
  const { error } = await admin()
    .from("group_members")
    .update({ user_id: userId })
    .eq("id", memberId)
    .is("user_id", null); // guards the race where two visitors claim at once
  if (error) return { error: "Could not claim that name. Please try again." };
  return { groupId: invite.group.id };
}

export async function joinGroupViaToken(
  token: string,
  userId: string,
  displayName: string
): Promise<TokenJoinResult> {
  const invite = await getGroupByInviteToken(token);
  if (!invite) return { error: "This invite link is invalid." };
  if (invite.members.some((m) => m.user_id === userId)) {
    return { error: "You are already a member of this group." };
  }
  const { error } = await admin().from("group_members").insert({
    group_id: invite.group.id,
    display_name: displayName,
    user_id: userId,
  });
  // unique (group_id, user_id) also backstops a join/claim race
  if (error) return { error: "Could not join this group. Please try again." };
  return { groupId: invite.group.id };
}
```

- [ ] **Step 2:** Run `npm run build` → succeeds (type check). `npm test` → still green (no new tests).
- [ ] **Step 3: Commit:** `git add src/lib/db.ts; git commit -m "feat: db query layer — RLS-scoped member ops, token-authorized invite ops"`

---

### Task 4: `?next=` redirect support in auth

**Files:**
- Modify: `src/app/actions.ts` (loginAction, registerAction)
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/register/page.tsx`

The invite flow sends visitors to `/login?next=/g/<token>`; after auth they must land back on the join page. `safeNextPath` (Phase 1) sanitizes the target.

- [ ] **Step 1: Edit `src/app/actions.ts`**

Add to the imports: `import { safeNextPath } from "@/lib/safe-redirect";`

Add this module-level helper (NOT exported — "use server" files may only export async actions):

```ts
function withNext(errorPath: string, next: string) {
  // authErrorRedirectPath always emits "?error=...", so "&" is correct here.
  return next === "/" ? errorPath : `${errorPath}&next=${encodeURIComponent(next)}`;
}
```

In `registerAction`, add as the first line of the body:
```ts
  const next = safeNextPath(formData.get("next") as string | null);
```
change the error redirect to:
```ts
    redirect(withNext(authErrorRedirectPath("/register", authErrorMessage(error)), next));
```
and change the trailing success lines to:
```ts
  revalidatePath("/", "layout");
  redirect(next);
```

In `loginAction`, the same three changes (error path `"/login"`):
```ts
  const next = safeNextPath(formData.get("next") as string | null);
  ...
    redirect(withNext(authErrorRedirectPath("/login", authErrorMessage(error)), next));
  ...
  revalidatePath("/", "layout");
  redirect(next);
```

Also in `logoutAction`, change `revalidatePath("/")` to `revalidatePath("/", "layout")` (group pages cache auth-dependent content too). Leave `forgotPasswordAction`/`updatePasswordAction` untouched.

- [ ] **Step 2: Edit `src/app/(auth)/login/page.tsx`**

- Add import: `import { safeNextPath } from "@/lib/safe-redirect";`
- Widen searchParams: `searchParams: Promise<{ reset?: string; error?: string; next?: string }>` and destructure `const { reset, error, next } = await searchParams;` then `const safeNext = safeNextPath(next ?? null);`
- Inside the `<form>`, first child: `<input type="hidden" name="next" value={safeNext} />`
- Change the "Create account" link href to preserve the target:
  `href={safeNext === "/" ? "/register" : `/register?next=${encodeURIComponent(safeNext)}`}`

- [ ] **Step 3: Edit `src/app/(auth)/register/page.tsx`** — mirror image:

- Add the `safeNextPath` import; widen searchParams to `{ error?: string; next?: string }`; compute `safeNext`.
- Hidden `next` input as the first child of the form.
- "Already have an account?" link href: `safeNext === "/" ? "/login" : `/login?next=${encodeURIComponent(safeNext)}`}`

- [ ] **Step 4:** Run `npm run build` → succeeds. `npm test` → green.
- [ ] **Step 5: Commit:** `git add -A; git commit -m "feat: auth actions and pages honor a sanitized ?next= redirect"`

---

### Task 5: Domain Server Actions + ExpenseForm component

**Files:**
- Create: `src/app/group-actions.ts`
- Create: `src/components/ExpenseForm.tsx`

- [ ] **Step 1: Write `src/app/group-actions.ts`** — exactly:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addPlaceholderMember,
  claimMemberViaToken,
  createExpense,
  createGroup,
  deleteExpense,
  getExpense,
  joinGroupViaToken,
  listMembers,
  updateExpense,
} from "@/lib/db";
import { parseExpenseForm } from "@/lib/expense-input";
import { parseMoneyToCents } from "@/lib/money";
import { currentUserId } from "@/lib/supabase-auth";

const fail = (path: string, message: string) =>
  `${path}?error=${encodeURIComponent(message)}`;

async function requireUserId(nextPath = "/"): Promise<string> {
  const userId = await currentUserId();
  if (!userId) {
    redirect(
      nextPath === "/"
        ? "/login"
        : `/login?next=${encodeURIComponent(nextPath)}`
    );
  }
  return userId;
}

const nameSchema = z.string().trim().min(1).max(80);

/* ---------- Groups & members ---------- */

const createGroupSchema = z.object({
  name: nameSchema,
  currency_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code."),
  display_name: nameSchema,
});

export async function createGroupAction(formData: FormData) {
  const userId = await requireUserId();
  const parsed = createGroupSchema.safeParse({
    name: formData.get("name"),
    currency_code: formData.get("currency_code"),
    display_name: formData.get("display_name"),
  });
  if (!parsed.success) {
    redirect(fail("/", parsed.error.issues[0]?.message ?? "Invalid input."));
  }
  const groupId = await createGroup({
    name: parsed.data.name,
    currencyCode: parsed.data.currency_code,
    userId,
    displayName: parsed.data.display_name,
  });
  revalidatePath("/");
  redirect(`/groups/${groupId}`);
}

export async function addMemberAction(formData: FormData) {
  await requireUserId();
  const groupId = z.uuid().safeParse(formData.get("group_id"));
  if (!groupId.success) redirect("/");
  const path = `/groups/${groupId.data}`;
  const name = nameSchema.safeParse(formData.get("display_name"));
  if (!name.success) redirect(fail(path, "Member name is required."));
  await addPlaceholderMember(groupId.data, name.data);
  revalidatePath(path);
  redirect(path);
}

/* ---------- Expenses ---------- */

export async function addExpenseAction(formData: FormData) {
  const userId = await requireUserId();
  const groupId = z.uuid().safeParse(formData.get("group_id"));
  if (!groupId.success) redirect("/");
  const path = `/groups/${groupId.data}`;

  // RLS returns an empty list to non-members.
  const members = await listMembers(groupId.data);
  if (members.length === 0) redirect("/");

  const result = parseExpenseForm(
    formData,
    members.map((m) => ({ id: m.id, displayName: m.display_name }))
  );
  if (!result.ok) redirect(fail(path, result.error));

  await createExpense(
    {
      groupId: groupId.data,
      description: result.expense.description,
      amountCents: result.expense.amountCents,
      paidBy: result.expense.paidBy,
      splitMethod: result.expense.splitMethod,
      isSettlement: false,
      expenseDate: result.expense.expenseDate,
      createdBy: userId,
    },
    result.expense.shares.map((s) => ({
      memberId: s.memberId,
      shareCents: s.shareCents,
      splitValue: s.splitValue,
    }))
  );
  revalidatePath(path);
  redirect(path);
}

const paymentSchema = z.object({
  group_id: z.uuid(),
  from_member: z.uuid(),
  to_member: z.uuid(),
  amount: z.string(),
});

export async function recordPaymentAction(formData: FormData) {
  const userId = await requireUserId();
  const parsed = paymentSchema.safeParse({
    group_id: formData.get("group_id"),
    from_member: formData.get("from_member"),
    to_member: formData.get("to_member"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) redirect("/");
  const { group_id, from_member, to_member, amount } = parsed.data;
  const path = `/groups/${group_id}`;

  if (from_member === to_member) {
    redirect(fail(path, "Payer and payee must be different people."));
  }
  const amountCents = parseMoneyToCents(amount);
  if (amountCents === null || amountCents <= 0) {
    redirect(fail(path, "Enter a valid amount (e.g. 12.50)."));
  }
  const members = await listMembers(group_id);
  const names = new Map(members.map((m) => [m.id, m.display_name]));
  if (!names.has(from_member) || !names.has(to_member)) {
    redirect(fail(path, "Both people must be group members."));
  }

  // A settle-up payment is an ordinary expense: payer pays, one share for the payee.
  await createExpense(
    {
      groupId: group_id,
      description: `${names.get(from_member)} paid ${names.get(to_member)}`,
      amountCents,
      paidBy: from_member,
      splitMethod: "exact",
      isSettlement: true,
      expenseDate: new Date().toISOString().slice(0, 10),
      createdBy: userId,
    },
    [{ memberId: to_member, shareCents: amountCents, splitValue: amountCents }]
  );
  revalidatePath(path);
  redirect(path);
}

const expenseIdsSchema = z.object({
  group_id: z.uuid(),
  expense_id: z.uuid(),
});

export async function updateExpenseAction(formData: FormData) {
  await requireUserId();
  const ids = expenseIdsSchema.safeParse({
    group_id: formData.get("group_id"),
    expense_id: formData.get("expense_id"),
  });
  if (!ids.success) redirect("/");
  const path = `/groups/${ids.data.group_id}`;
  const editPath = `${path}/expenses/${ids.data.expense_id}`;

  const existing = await getExpense(ids.data.expense_id);
  if (!existing || existing.group_id !== ids.data.group_id) redirect("/");

  const members = await listMembers(ids.data.group_id);
  const result = parseExpenseForm(
    formData,
    members.map((m) => ({ id: m.id, displayName: m.display_name }))
  );
  if (!result.ok) redirect(fail(editPath, result.error));

  await updateExpense(
    ids.data.expense_id,
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
  revalidatePath(path);
  redirect(path);
}

export async function deleteExpenseAction(formData: FormData) {
  await requireUserId();
  const ids = expenseIdsSchema.safeParse({
    group_id: formData.get("group_id"),
    expense_id: formData.get("expense_id"),
  });
  if (!ids.success) redirect("/");
  // RLS: non-members delete nothing.
  await deleteExpense(ids.data.expense_id);
  const path = `/groups/${ids.data.group_id}`;
  revalidatePath(path);
  redirect(path);
}

/* ---------- Invite-token join/claim ---------- */

export async function claimMemberAction(formData: FormData) {
  const parsed = z
    .object({ token: z.string().min(1), member_id: z.uuid() })
    .safeParse({
      token: formData.get("token"),
      member_id: formData.get("member_id"),
    });
  if (!parsed.success) redirect("/");
  const joinPath = `/g/${parsed.data.token}`;
  const userId = await requireUserId(joinPath);
  const result = await claimMemberViaToken(
    parsed.data.token,
    parsed.data.member_id,
    userId
  );
  if ("error" in result) redirect(fail(joinPath, result.error));
  revalidatePath(`/groups/${result.groupId}`);
  redirect(`/groups/${result.groupId}`);
}

export async function joinGroupAction(formData: FormData) {
  const token = z.string().min(1).safeParse(formData.get("token"));
  if (!token.success) redirect("/");
  const joinPath = `/g/${token.data}`;
  const userId = await requireUserId(joinPath);
  const name = nameSchema.safeParse(formData.get("display_name"));
  if (!name.success) redirect(fail(joinPath, "Your name is required."));
  const result = await joinGroupViaToken(token.data, userId, name.data);
  if ("error" in result) redirect(fail(joinPath, result.error));
  revalidatePath(`/groups/${result.groupId}`);
  redirect(`/groups/${result.groupId}`);
}
```

- [ ] **Step 2: Write `src/components/ExpenseForm.tsx`** — exactly:

```tsx
"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import type { SplitMethod } from "@/lib/splits";

export type ExpenseFormMemberOption = { id: string; displayName: string };

export type ExpenseFormInitial = {
  description: string;
  amount: string;
  paidBy: string;
  expenseDate: string;
  splitMethod: SplitMethod;
  included: Record<string, boolean>;
  values: Record<string, string>;
};

const VALUE_PLACEHOLDER: Record<Exclude<SplitMethod, "equal">, string> = {
  exact: "0.00",
  percent: "%",
  shares: "shares",
};

/**
 * Shared add/edit expense form. Field names form a contract with
 * parseExpenseForm in src/lib/expense-input.ts — change them together.
 */
export function ExpenseForm({
  action,
  members,
  defaultDate,
  submitLabel,
  hiddenFields,
  initial,
}: {
  action: (formData: FormData) => void | Promise<void>;
  members: ExpenseFormMemberOption[];
  defaultDate: string;
  submitLabel: string;
  hiddenFields: Record<string, string>;
  initial?: ExpenseFormInitial;
}) {
  const [method, setMethod] = useState<SplitMethod>(
    initial?.splitMethod ?? "equal"
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Field label="Description">
        <Input
          name="description"
          placeholder="Dinner"
          required
          maxLength={200}
          defaultValue={initial?.description}
        />
      </Field>
      <Field label="Amount">
        <Input
          name="amount"
          inputMode="decimal"
          placeholder="12.50"
          required
          defaultValue={initial?.amount}
        />
      </Field>
      <Field label="Paid by">
        <Select name="paid_by" defaultValue={initial?.paidBy}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date">
        <Input
          name="expense_date"
          type="date"
          required
          defaultValue={initial?.expenseDate ?? defaultDate}
        />
      </Field>
      <Field label="Split">
        <Select
          name="split_method"
          value={method}
          onChange={(e) => setMethod(e.target.value as SplitMethod)}
        >
          <option value="equal">Equally</option>
          <option value="exact">Exact amounts</option>
          <option value="percent">Percentages</option>
          <option value="shares">Shares</option>
        </Select>
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-ink">
          Split between
        </legend>
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3">
            <label className="flex flex-1 items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name={`participant_${m.id}`}
                defaultChecked={initial ? Boolean(initial.included[m.id]) : true}
              />
              {m.displayName}
            </label>
            {method !== "equal" && (
              <Input
                name={`value_${m.id}`}
                inputMode="decimal"
                className="w-28"
                placeholder={VALUE_PLACEHOLDER[method]}
                defaultValue={initial?.values[m.id] ?? ""}
                aria-label={`Value for ${m.displayName}`}
              />
            )}
          </div>
        ))}
      </fieldset>
      <Button>{submitLabel}</Button>
    </form>
  );
}
```

- [ ] **Step 3:** Run `npm run build` → succeeds. `npm test` → green.
- [ ] **Step 4: Commit:** `git add src/app/group-actions.ts src/components/ExpenseForm.tsx; git commit -m "feat: domain server actions and shared expense form"`

---

### Task 6: Dashboard + group detail pages

**Files:**
- Rewrite: `src/app/page.tsx`
- Create: `src/app/groups/[id]/page.tsx`

- [ ] **Step 1: Replace `src/app/page.tsx`** — exactly:

```tsx
import Link from "next/link";
import { createGroupAction } from "@/app/group-actions";
import { AuthNav } from "@/components/AuthNav";
import { Alert, Button, Card, Field, Input, PageShell } from "@/components/ui";
import { listGroupsForUser } from "@/lib/db";
import { serverAuth } from "@/lib/supabase-auth";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await serverAuth();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return (
      <PageShell narrow headerRight={<AuthNav />}>
        <Card title="Split expenses with your friends">
          <p className="text-sm text-muted">
            Track shared expenses in groups, split them fairly, and settle up
            with the fewest payments. Log in or create an account to start.
          </p>
        </Card>
      </PageShell>
    );
  }

  const groups = await listGroupsForUser();
  const defaultName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : "";

  return (
    <PageShell
      headerRight={<AuthNav />}
      aside={
        <Card title="New group">
          {error && <Alert tone="danger">{error}</Alert>}
          <form action={createGroupAction} className="mt-1 flex flex-col gap-3">
            <Field label="Group name">
              <Input name="name" placeholder="Bali trip" required maxLength={80} />
            </Field>
            <Field label="Currency">
              <Input name="currency_code" defaultValue="SGD" required maxLength={3} />
            </Field>
            <Field label="Your name in this group">
              <Input
                name="display_name"
                defaultValue={defaultName}
                required
                maxLength={80}
              />
            </Field>
            <Button>Create group</Button>
          </form>
        </Card>
      }
    >
      <Card title="Your groups">
        {groups.length === 0 ? (
          <p className="text-sm text-muted">
            No groups yet — create one to get started.
          </p>
        ) : (
          <ul className="flex flex-col">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.id}`}
                  className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span className="font-semibold text-ink">{g.name}</span>
                  <span className="text-muted">{g.currency_code}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
```

- [ ] **Step 2: Create `src/app/groups/[id]/page.tsx`** — exactly:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import {
  addExpenseAction,
  addMemberAction,
  recordPaymentAction,
} from "@/app/group-actions";
import { AuthNav } from "@/components/AuthNav";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { ExpenseForm } from "@/components/ExpenseForm";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageShell,
  Select,
  StatRow,
} from "@/components/ui";
import { computeBalances } from "@/lib/balances";
import { getGroup, listExpenses, listMembers } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { simplifyDebts } from "@/lib/simplify";
import { currentUserId } from "@/lib/supabase-auth";

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const userId = await currentUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/groups/${id}`)}`);

  const group = await getGroup(id);
  if (!group) notFound(); // unknown id, or not a member (RLS hides it)
  const members = await listMembers(id);
  const expenses = await listExpenses(id);

  const ledger = expenses.map((e) => ({
    paidByMemberId: e.paid_by,
    amountCents: e.amount_cents,
    shares: e.expense_shares.map((s) => ({
      memberId: s.member_id,
      shareCents: s.share_cents,
    })),
  }));
  const balances = computeBalances(members.map((m) => m.id), ledger);
  const transfers = simplifyDebts(balances);
  const nameOf = new Map(members.map((m) => [m.id, m.display_name]));
  const today = new Date().toISOString().slice(0, 10);
  const inviteUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/g/${group.invite_token}`;
  const memberOptions = members.map((m) => ({
    id: m.id,
    displayName: m.display_name,
  }));

  return (
    <PageShell
      headerRight={<AuthNav />}
      aside={
        <>
          <Card title="Add expense">
            <ExpenseForm
              action={addExpenseAction}
              members={memberOptions}
              defaultDate={today}
              submitLabel="Add expense"
              hiddenFields={{ group_id: group.id }}
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
                  {m.user_id === null && (
                    <span className="text-xs text-muted">placeholder</span>
                  )}
                </li>
              ))}
            </ul>
            <form action={addMemberAction} className="flex items-end gap-2">
              <input type="hidden" name="group_id" value={group.id} />
              <Field label="Add a name">
                <Input name="display_name" placeholder="Alex" required maxLength={80} />
              </Field>
              <Button variant="secondary" className="shrink-0">
                Add
              </Button>
            </form>
          </Card>
        </>
      }
    >
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-heading">{group.name}</h1>
        <CopyLinkButton url={inviteUrl} label="Copy invite link" />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}

      <Card title="Balances">
        {members.map((m) => (
          <StatRow
            key={m.id}
            label={m.display_name}
            value={formatMoney(balances.get(m.id) ?? 0, group.currency_code)}
          />
        ))}
      </Card>

      <Card title="Settle up">
        {transfers.length === 0 ? (
          <p className="text-sm text-muted">All settled up 🎉</p>
        ) : (
          <ul className="mb-3 flex flex-col gap-1 text-sm">
            {transfers.map((t, i) => (
              <li key={i}>
                <span className="font-semibold">{nameOf.get(t.fromMemberId)}</span>{" "}
                pays{" "}
                <span className="font-semibold">{nameOf.get(t.toMemberId)}</span>{" "}
                {formatMoney(t.amountCents, group.currency_code)}
              </li>
            ))}
          </ul>
        )}
        <form
          action={recordPaymentAction}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="group_id" value={group.id} />
          <Field label="From">
            <Select name="from_member">
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To">
            <Select name="to_member">
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
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
      </Card>

      <Card title="Expenses">
        {expenses.length === 0 ? (
          <p className="text-sm text-muted">No expenses yet.</p>
        ) : (
          <ul className="flex flex-col">
            {expenses.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/groups/${group.id}/expenses/${e.id}`}
                  className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span>
                    <span className="font-semibold text-ink">{e.description}</span>
                    <span className="ml-2 text-xs text-muted">
                      {e.expense_date} · paid by {nameOf.get(e.paid_by) ?? "?"}
                      {e.is_settlement ? " · settle-up" : ""}
                    </span>
                  </span>
                  <span className="font-semibold text-ink">
                    {formatMoney(e.amount_cents, group.currency_code)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
```

- [ ] **Step 3:** Run `npm run build` → succeeds. `npm test` → green.
- [ ] **Step 4: Commit:** `git add -A; git commit -m "feat: dashboard and group detail with balances and settle-ups"`

---

### Task 7: Expense edit/delete + invite join pages

**Files:**
- Create: `src/app/groups/[id]/expenses/[expenseId]/page.tsx`
- Create: `src/app/g/[inviteToken]/page.tsx`

- [ ] **Step 1: Create `src/app/groups/[id]/expenses/[expenseId]/page.tsx`** — exactly:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { deleteExpenseAction, updateExpenseAction } from "@/app/group-actions";
import { AuthNav } from "@/components/AuthNav";
import { ExpenseForm } from "@/components/ExpenseForm";
import { Alert, Button, Card, PageShell } from "@/components/ui";
import { getExpense, getGroup, listMembers } from "@/lib/db";
import { centsToMoneyString } from "@/lib/money";
import { currentUserId } from "@/lib/supabase-auth";

export default async function EditExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; expenseId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, expenseId } = await params;
  const { error } = await searchParams;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(expenseId).success) {
    notFound();
  }
  const userId = await currentUserId();
  if (!userId) {
    redirect(
      `/login?next=${encodeURIComponent(`/groups/${id}/expenses/${expenseId}`)}`
    );
  }

  const group = await getGroup(id);
  if (!group) notFound();
  const expense = await getExpense(expenseId);
  if (!expense || expense.group_id !== id) notFound();
  const members = await listMembers(id);

  const included: Record<string, boolean> = {};
  const values: Record<string, string> = {};
  for (const share of expense.expense_shares) {
    included[share.member_id] = true;
    if (expense.split_method === "exact") {
      values[share.member_id] = centsToMoneyString(share.share_cents);
    } else if (share.split_value !== null) {
      values[share.member_id] = String(share.split_value);
    }
  }

  return (
    <PageShell narrow headerRight={<AuthNav />}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-heading">Edit expense</h1>
        <Link
          href={`/groups/${id}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Back to {group.name}
        </Link>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Card>
        <ExpenseForm
          action={updateExpenseAction}
          members={members.map((m) => ({ id: m.id, displayName: m.display_name }))}
          defaultDate={expense.expense_date}
          submitLabel="Save changes"
          hiddenFields={{ group_id: id, expense_id: expenseId }}
          initial={{
            description: expense.description,
            amount: centsToMoneyString(expense.amount_cents),
            paidBy: expense.paid_by,
            expenseDate: expense.expense_date,
            splitMethod: expense.split_method,
            included,
            values,
          }}
        />
      </Card>
      <Card title="Danger zone">
        <form action={deleteExpenseAction}>
          <input type="hidden" name="group_id" value={id} />
          <input type="hidden" name="expense_id" value={expenseId} />
          <Button variant="danger">Delete expense</Button>
        </form>
      </Card>
    </PageShell>
  );
}
```

- [ ] **Step 2: Create `src/app/g/[inviteToken]/page.tsx`** — exactly:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { claimMemberAction, joinGroupAction } from "@/app/group-actions";
import { AuthNav } from "@/components/AuthNav";
import { Alert, Button, Card, Field, Input, PageShell } from "@/components/ui";
import { getGroupByInviteToken } from "@/lib/db";
import { serverAuth } from "@/lib/supabase-auth";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ inviteToken: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { inviteToken } = await params;
  const { error } = await searchParams;
  const invite = await getGroupByInviteToken(inviteToken);
  if (!invite) notFound();
  const { group, members } = invite;

  const supabase = await serverAuth();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const joinPath = `/g/${inviteToken}`;
  const existing = user ? members.find((m) => m.user_id === user.id) : undefined;
  const placeholders = members.filter((m) => m.user_id === null);
  const defaultName =
    user && typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : "";

  return (
    <PageShell narrow headerRight={<AuthNav />}>
      <Card title={`Join “${group.name}”`}>
        {error && <Alert tone="danger">{error}</Alert>}
        <p className="text-sm text-muted">
          {members.length} member{members.length === 1 ? "" : "s"}:{" "}
          {members.map((m) => m.display_name).join(", ") || "none yet"}
        </p>
      </Card>

      {!user && (
        <Card>
          <p className="text-sm text-muted">
            Log in or create an account to join this group.
          </p>
          <div className="mt-3 flex gap-3 text-sm font-semibold">
            <Link
              href={`/login?next=${encodeURIComponent(joinPath)}`}
              className="text-primary hover:underline"
            >
              Log in
            </Link>
            <Link
              href={`/register?next=${encodeURIComponent(joinPath)}`}
              className="text-primary hover:underline"
            >
              Register
            </Link>
          </div>
        </Card>
      )}

      {user && existing && (
        <Card>
          <p className="text-sm text-muted">
            You&apos;re already in this group as {existing.display_name}.
          </p>
          <Link
            href={`/groups/${group.id}`}
            className="mt-2 inline-block text-sm font-semibold text-primary hover:underline"
          >
            Open {group.name}
          </Link>
        </Card>
      )}

      {user && !existing && (
        <>
          {placeholders.length > 0 && (
            <Card title="Is one of these you?">
              <ul className="flex flex-col gap-2">
                {placeholders.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="font-semibold text-ink">
                      {m.display_name}
                    </span>
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
      )}
    </PageShell>
  );
}
```

- [ ] **Step 3:** Run `npm run build` → succeeds. `npm test` → green. `npm run lint` → clean.
- [ ] **Step 4: Commit:** `git add -A; git commit -m "feat: expense edit/delete and invite join/claim pages"`

---

### Task 8: End-to-end verification

- [ ] **Step 1: Automated:** `npm test` (all suites green — expect 50+ tests), `npm run lint`, `npm run build`.

- [ ] **Step 2: Live smoke (dev server against the real Supabase project):**

1. Sign in (smoke account exists: `chiyang+smoketest1@tatsu.works` / `smoketest-pw-123`).
2. Create a group → lands on `/groups/<id>`; creator appears as a member.
3. Add a placeholder member ("Alex").
4. Add an equal expense paid by the creator split across both → balances show creator positive, Alex negative, summing to zero; settle-up suggests Alex pays creator.
5. Add an exact-split expense with values that don't sum → friendly error via `?error=`.
6. Edit the first expense (change amount) → balances update; delete an expense → it disappears and balances update.
7. Record a payment matching the suggestion → "All settled up".
8. Copy/visit the invite link `/g/<token>` while signed out → group name + member names visible; log in via the page's link → returns to the join page (`?next=` round-trip); claim the "Alex" placeholder with a second account, or join as new member → lands on the group; history intact.
9. Negative checks: visit `/groups/<id>` with a non-member account → 404; visit `/g/<garbage-token>` → 404.

- [ ] **Step 3: Commit anything outstanding;** working tree clean.

---

## Self-review notes (already applied)

- `crypto.randomUUID()` for group/expense ids — documented RLS-RETURNING rationale in db.ts.
- `updateExpense` is 3 statements without a transaction; window is tiny at group scale; rollback is best-effort on create. Revisit with a Postgres RPC if it ever bites (noted, not built — YAGNI).
- Settlement edits: settlements appear in the expense list and use the same edit page; editing one as a 4-way split is possible but harmless (it's just an expense). Accepted.
- Phase 3 (cron backup, deploy) is NOT in this plan.
