CREATE TABLE jobs(tenant_id text NOT NULL,id text NOT NULL,data jsonb NOT NULL,PRIMARY KEY(tenant_id,id),CHECK(data->>'tenantId'=tenant_id AND data->>'id'=id));
CREATE TABLE outbox(LIKE jobs INCLUDING ALL);
ALTER TABLE jobs ADD COLUMN conversation_id text GENERATED ALWAYS AS(data->>'conversationId') STORED;
ALTER TABLE jobs ADD FOREIGN KEY(tenant_id,conversation_id) REFERENCES conversations(tenant_id,id);
CREATE UNIQUE INDEX outbox_key ON outbox(tenant_id,(data->>'logicalKey')) WHERE data ? 'logicalKey';
CREATE UNIQUE INDEX job_key ON jobs(tenant_id,(data->>'logicalKey')) WHERE data ? 'logicalKey';
