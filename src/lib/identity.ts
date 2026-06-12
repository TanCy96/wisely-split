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
