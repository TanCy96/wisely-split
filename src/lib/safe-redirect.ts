/**
 * Returns `next` only when it is a safe in-app path. Guards against
 * open-redirects: anything not starting with a single "/" (external URLs,
 * protocol-relative "//host", or backslash "/\host" tricks) falls back to "/".
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || next[0] !== "/") return "/";
  if (next[1] === "/" || next[1] === "\\") return "/";
  return next;
}
