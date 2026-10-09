DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['tenants','memberships','assistant_drafts','assistant_versions','assistant_tests','inquiries','conversations','messages','integrations','events','jobs','outbox','usage','audit','public_sessions','reservations'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_scope ON %I USING (tenant_id = current_setting(''app.tenant_id'',true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'',true))',tab);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO inmo_app',tab);
 END LOOP;
END $$;
REVOKE UPDATE,DELETE ON assistant_versions FROM inmo_app;
