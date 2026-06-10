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
