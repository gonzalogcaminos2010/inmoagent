ALTER TABLE assistant_drafts DROP COLUMN owner_id;
ALTER TABLE assistant_drafts ADD COLUMN owner_id text GENERATED ALWAYS AS (nullif(data->>'ownerMembershipId','')) STORED;
ALTER TABLE assistant_drafts ADD FOREIGN KEY(tenant_id,owner_id) REFERENCES memberships(tenant_id,id);
