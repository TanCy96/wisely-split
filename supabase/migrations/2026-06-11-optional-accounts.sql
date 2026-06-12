-- Anonymous full access via invite link: expenses can be created by visitors
-- with no auth account, so created_by becomes nullable. NULL = "someone with
-- the invite link". groups.created_by stays NOT NULL (group creation still
-- requires an account).

alter table expenses alter column created_by drop not null;
