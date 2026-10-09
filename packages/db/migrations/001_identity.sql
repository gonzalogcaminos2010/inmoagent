DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='inmo_app') THEN CREATE ROLE inmo_app LOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;
CREATE TABLE IF NOT EXISTS schema_migrations(name text primary key);
