-- Fix: the creator-bootstrap branch of the group_members INSERT policy read
-- groups through the caller's RLS context. A creator who is not yet a member
-- cannot see their own just-created group row, so the subquery returned NULL
-- and creating any group failed on the self-member insert.
-- Same medicine as is_group_member: a security definer helper that reads
-- groups without RLS.

create or replace function is_group_creator(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from groups
    where id = gid and created_by = auth.uid()
  );
$$;

drop policy "members insert members" on group_members;
create policy "members insert members" on group_members
  for insert with check (
    is_group_member(group_id) or is_group_creator(group_id)
  );
