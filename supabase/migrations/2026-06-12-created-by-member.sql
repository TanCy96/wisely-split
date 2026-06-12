-- Attribution for the anonymous-identity feature: which MEMBER created an
-- expense (works for anonymous and signed-in actors; created_by keeps
-- tracking the auth user when there is one). Stamped on create only —
-- semantic is "added by", never re-stamped on edit. NULL on all pre-existing
-- rows and when the creating member is later deleted.

alter table expenses
  add column created_by_member uuid references group_members (id) on delete set null;
