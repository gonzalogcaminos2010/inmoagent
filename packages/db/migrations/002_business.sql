DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['tenants','memberships','assistant_drafts','assistant_versions','assistant_tests','inquiries','conversations','messages','integrations','events','usage','audit','public_sessions','reservations'] LOOP
  EXECUTE format('CREATE TABLE %I (tenant_id text NOT NULL, id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY(tenant_id,id), CHECK (data->>''tenantId''=tenant_id AND data->>''id''=id))',tab);
 END LOOP;
END $$;
ALTER TABLE inquiries ADD COLUMN owner_id text GENERATED ALWAYS AS (data->>'ownerMembershipId') STORED;
ALTER TABLE inquiries ADD FOREIGN KEY(tenant_id,owner_id) REFERENCES memberships(tenant_id,id);
ALTER TABLE inquiries ADD CHECK (data->>'status' IS NULL OR (owner_id IS NOT NULL AND ((data->>'status'='closed' AND length(data->>'result')>0) OR (data->>'status' IN ('new','active') AND length(data->>'nextAction')>0 AND data->>'nextActionAt' IS NOT NULL))));
ALTER TABLE conversations ADD COLUMN inquiry_id text GENERATED ALWAYS AS (data->>'inquiryId') STORED;
ALTER TABLE conversations ADD FOREIGN KEY(tenant_id,inquiry_id) REFERENCES inquiries(tenant_id,id);
ALTER TABLE messages ADD COLUMN conversation_id text GENERATED ALWAYS AS (data->>'conversationId') STORED;
ALTER TABLE messages ADD FOREIGN KEY(tenant_id,conversation_id) REFERENCES conversations(tenant_id,id);
ALTER TABLE assistant_drafts ADD COLUMN owner_id text GENERATED ALWAYS AS (data->>'ownerMembershipId') STORED;
ALTER TABLE assistant_drafts ADD FOREIGN KEY(tenant_id,owner_id) REFERENCES memberships(tenant_id,id);
ALTER TABLE assistant_versions ADD COLUMN owner_id text GENERATED ALWAYS AS (data->>'ownerMembershipId') STORED;
ALTER TABLE assistant_versions ADD FOREIGN KEY(tenant_id,owner_id) REFERENCES memberships(tenant_id,id);
CREATE UNIQUE INDEX published_key ON assistant_versions(tenant_id,(data->>'publicationKey')) WHERE data ? 'publicationKey';
CREATE UNIQUE INDEX incoming_key ON messages(tenant_id,conversation_id,(data->>'clientMessageId')) WHERE data ? 'clientMessageId';
CREATE UNIQUE INDEX event_key ON events(tenant_id,(data->>'externalId')) WHERE data ? 'externalId';
