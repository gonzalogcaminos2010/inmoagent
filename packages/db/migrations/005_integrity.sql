REVOKE INSERT,UPDATE,DELETE ON memberships FROM inmo_app;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['tenants','memberships','assistant_drafts','assistant_versions','assistant_tests','inquiries','conversations','messages','integrations','events','jobs','outbox','usage','audit','public_sessions','reservations'] LOOP
  EXECUTE format('ALTER TABLE %I ADD CHECK (coalesce(data->>''tenantId''=tenant_id AND data->>''id''=id,false))',tab);
 END LOOP;
END $$;
-- Eliminar únicamente las filas incompletas de pruebas de esquema anteriores a esta migración.
DELETE FROM inquiries WHERE data->>'status' IS NULL;
ALTER TABLE inquiries ADD CHECK (coalesce(data->>'status' IN ('new','active','closed') AND owner_id IS NOT NULL AND ((data->>'status'='closed' AND length(trim(data->>'result'))>0) OR (data->>'status' IN ('new','active') AND length(trim(data->>'nextAction'))>0 AND data->>'nextActionAt' IS NOT NULL)),false));
DO $$ DECLARE item text[]; BEGIN
 FOREACH item SLICE 1 IN ARRAY ARRAY[
  ['assistant_versions','draftId','assistant_drafts'],['assistant_tests','configId','assistant_drafts'],
  ['public_sessions','configId','assistant_versions'],['messages','configId','assistant_versions'],
  ['jobs','configId','assistant_versions'],['outbox','configId','assistant_versions'],
  ['outbox','conversationId','conversations'],['outbox','jobId','jobs'],
  ['events','integrationId','integrations'],['reservations','usageId','usage']
 ] LOOP
  EXECUTE format('ALTER TABLE %I ADD COLUMN %I text GENERATED ALWAYS AS (data->>%L) STORED',item[1],'ref_'||lower(item[2]),item[2]);
  EXECUTE format('ALTER TABLE %I ADD FOREIGN KEY (tenant_id,%I) REFERENCES %I(tenant_id,id)',item[1],'ref_'||lower(item[2]),item[3]);
 END LOOP;
END $$;
