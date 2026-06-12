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
