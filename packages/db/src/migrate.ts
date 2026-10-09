import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
export async function migrate() {
  const bootstrap = new Pool({
    connectionString:
      process.env.MIGRATOR_URL ??
      "postgres://postgres@127.0.0.1:55432/postgres",
  });
  if (
    !(
      await bootstrap.query("SELECT FROM pg_database WHERE datname='inmoagent'")
    ).rowCount
  )
    await bootstrap.query("CREATE DATABASE inmoagent");
  await bootstrap.end();
  const p = new Pool({
    connectionString:
      process.env.MIGRATION_DATABASE_URL ??
      "postgres://postgres@127.0.0.1:55432/inmoagent",
  });
  const c = await p.connect();
  try {
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text primary key)",
    );
    for (const file of (
      await readdir(new URL("../migrations/", import.meta.url))
    ).sort()) {
      if (
        (await c.query("SELECT FROM schema_migrations WHERE name=$1", [file]))
          .rowCount
      )
        continue;
      await c.query("BEGIN");
      try {
        await c.query(
          await readFile(
            new URL("../migrations/" + file, import.meta.url),
            "utf8",
          ),
        );
        await c.query("INSERT INTO schema_migrations VALUES($1)", [file]);
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    }
    for (const [tenantId, id, userId, role] of [
      ["tenant-a", "member-a-admin", "user-a-admin", "admin"],
      ["tenant-a", "member-a-operator", "user-a-operator", "operator"],
      ["tenant-b", "member-b-admin", "user-b-admin", "admin"],
    ])
      await c.query(
        "INSERT INTO memberships(tenant_id,id,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [tenantId, id, { tenantId, id, userId, role, active: true }],
      );
    for (const [tenantId, name] of [
      ["tenant-a", "Río Propiedades"],
      ["tenant-b", "Sur Inmuebles"],
    ])
      await c.query(
        "INSERT INTO tenants(tenant_id,id,data) VALUES($1,$1,$2) ON CONFLICT DO NOTHING",
        [
          tenantId,
          { tenantId, id: tenantId, name, paused: false, suspended: false },
        ],
      );
  } finally {
    c.release();
    await p.end();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  migrate().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
