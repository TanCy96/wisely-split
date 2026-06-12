# wisely-split — Feedback Round 2 Design: Anonymous Identity + Modal Editing

**Date:** 2026-06-12
**Status:** Approved pending user review
**Builds on:** `2026-06-10-wisely-split-design.md` and the merged feedback-round-1 work (anonymous full access via invite token, shared `GroupView`, inline `?edit=` editing).

## Purpose

Two refinements from hands-on use of the anonymous invite flow:

1. **Anonymous users need a name first.** Full write access via `/g/<token>` stays,
   but a visitor must identify as a group member before the write UI unlocks, and
   expenses record which member created them.
2. **Expense editing should be smooth and obvious.** Replace the aside-swap
   (`?edit=` server re-render, invisible below the fold on phones) with a modal
   dialog that opens instantly.

Both ship on one branch. User decisions captured 2026-06-12:
identity card gates writes (not a hard page gate, not per-action name fields);
attribution **is recorded** in the DB (`created_by_member` + "added by" display);
editing happens in a **modal dialog**.

## Feature 1: Anonymous identity gate

### Data

New migration (manual apply by user, same workflow as always):

```sql
alter table expenses
  add column created_by_member uuid references group_members (id) on delete set null;
```

- `created_by_member` = the **member row** of whoever created the expense; works
  for anonymous and signed-in actors alike. `created_by` (auth uid, nullable)
  stays untouched — the two columns answer different questions.
- Stamped **on create only** (expenses and settlements). Edits do not re-stamp:
  the semantic is "added by", not "last touched by".
- `ExpenseRow`/`ExpenseInput`/`EXPENSE_COLUMNS` in `db.ts` gain the field
  (`createdByMember: string | null` on input). Both the member actions and the
  token actions pass it; existing rows are NULL and display nothing.

### Identity cookie

- Name `ws_identity_<groupId>`, value = a `group_members.id` uuid, httpOnly,
  `path=/`, max-age 1 year. One cookie per group.
- The `/g/[inviteToken]` page reads it server-side and validates it against the
  fetched member list — a stale id (member deleted) is treated as absent.
- The picker offers **all current members** (tap a name) or a "new name" input.
  This is honor-system identity for a friend group, not authentication; the
  invite token remains the only authorization.

### Flow on `/g/<token>` (anonymous visitor)

- **No valid cookie:** group renders fully readable (balances, settle-up
  suggestions, expense list, total spent) but every write form is replaced by a
  single "Who are you?" card: existing member names as buttons + "or add your
  name" input. Expense rows render as plain rows (no edit affordance).
- **Valid cookie:** full write UI; a line near the header reads
  "You're here as **Alex** — switch"; "Paid by" defaults to that member;
  `created_by_member` is stamped on adds and settlements.
- Signed-in members keep being redirected to `/groups/<id>` (unchanged).
- Signed-in non-members keep the claim/join cards — that is their
  identification path; the "Who are you?" picker renders **only for signed-out
  visitors**. Write UI stays locked for signed-in non-members until they claim
  or join (which redirects them to the member view). A leftover identity
  cookie from before logging in still unlocks writes — acceptable for an
  honor-system gate.

### Actions (`token-actions.ts`)

- New `identifyViaTokenAction`: token + (`member_id` | `display_name`).
  `member_id` must belong to the token's group; `display_name` creates a
  placeholder member via the existing `addMemberViaToken`. Sets the cookie,
  redirects back to `/g/<token>`.
- New `clearIdentityViaTokenAction` ("switch"): deletes the cookie, redirects
  back — the picker shows again.
- **Server-side enforcement:** every token write action (add/update/delete
  expense, record payment, add member) requires a valid identity cookie —
  `requireInvite` grows into `requireInvite(formData, { identity: true })`
  returning the validated member id, redirecting with
  "Pick your name first." otherwise. The gate is real, not just hidden UI.
- Member actions (`group-actions.ts`) stamp `created_by_member` with the
  signed-in user's own member row (found in the already-fetched member list).

### Display

Expense list lines gain "· added by {name}" when `created_by_member` resolves
to a current member (NULL or deleted member → omitted).

## Feature 2: Modal expense editing

### Principle

The URL stays the source of truth (`?edit=<id>`), but opening the modal uses
the **History API** (`window.history.replaceState`) which Next.js syncs into
`useSearchParams` **without a server round-trip** — instant open, data already
on the page. Server actions and the redirect-with-`?error=` model are untouched.

### Component

New client island `src/components/ExpenseList.tsx`, rendered by `GroupView` in
place of the current list + aside-swap:

- Props: display rows + **precomputed per-expense form initials** (built
  server-side in `GroupView`, serializable), `memberOptions`, `currencyCode`,
  `basePath`, `hiddenFields`, `updateAction`, `deleteAction`,
  `editingIdFromServer`, `errorFromServer`, `canEdit`.
- Rows render as `<a href="?edit=<id>">` (no-JS fallback works — SSR with
  `?edit=` renders the modal open); with JS, click is intercepted →
  `history.replaceState` → modal opens instantly with the row highlighted.
- Modal: plain fixed-position overlay + card (Tailwind, no new dependency),
  containing the existing `ExpenseForm` (prefilled, "Save changes") and the
  Delete button. Esc and backdrop-click close it (`history.replaceState` back
  to `basePath`).
- `canEdit={false}` (anonymous without identity) renders plain non-clickable
  rows.

### Save / error round-trip

- **Success:** action redirects to `basePath` → URL loses `?edit=` → modal
  closes, fresh data renders. No change to actions.
- **Validation failure:** action already redirects to `?edit=<id>&error=…` →
  modal renders open with the error **inside it**; `GroupView` suppresses the
  top-of-page alert exactly when the modal will be open (valid `?edit=` and
  editing allowed) so the error shows in one place.

### Aside

The aside always shows "Add expense" — the add/edit swap and the aside edit
card are removed from `GroupView`.

## Error handling

Unchanged patterns: `redirect("…?error=…")` + `<Alert tone="danger">`; token
actions return `{ error }` objects from `db.ts` and translate to redirects.
New error string: "Pick your name first." for gated writes without identity.

## Testing

- Unit: suite stays green; no engine changes. Identity-cookie validation lives
  in page/action code (thin, covered by live smoke).
- `npm test` / `npm run build` / `npm run lint` per task (lean: don't re-run
  when nothing changed; commit per task).
- Live smoke (dev server, real Supabase, after migration):
  - No cookie → picker card, no write forms, plain rows; POST a write without
    the cookie → redirected with "Pick your name first." and no DB write.
  - Pick existing name → cookie set, forms appear, "You're here as … — switch"
    renders, Paid-by defaults; new expense has `created_by_member` set and the
    list shows "added by".
  - New-name path creates a placeholder member and identifies as it.
  - Switch clears the cookie and the picker returns.
  - `?edit=<id>` SSR renders the modal open (curl); error redirect renders the
    error inside the modal and not at page top; success closes (URL clean).
  - Member view `/groups/[id]`: modal editing works; adds stamp the member's
    own row.

## Out of scope (YAGNI)

Last-edited-by tracking, real authentication of anonymous identities, identity
on the member view beyond stamping, modal for "Add expense", animations beyond
simple appearance, per-expense edit history.
