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
