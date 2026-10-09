import { beforeAll, afterAll, test, expect } from "vitest";
import { Pool } from "pg";
import { migrate } from "../../packages/db/src/migrate.js";
import { Database, tables } from "../../packages/db/src/tenant-transaction.js";
const a = {
  tenantId: "tenant-a",
  userId: "user-a-admin",
  membershipId: "member-a-admin",
  role: "admin" as const,
};
const b = {
  tenantId: "tenant-b",
  userId: "user-b-admin",
  membershipId: "member-b-admin",
  role: "admin" as const,
};
let db: Database;
beforeAll(async () => {
  await migrate();
  db = new Database();
});
afterAll(async () => {
  await db?.close();
});
test("actual app role is not owner, superuser or RLS bypass", async () => {
  const p = new Pool({
    connectionString: "postgres://inmo_app@127.0.0.1:55432/inmoagent",
  });
  const r = await p.query(
    "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
  );
  expect(r.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  await p.end();
});
test("all business entities reject cross-tenant CRUD and contextless access", async () => {
  for (const table of tables) {
    const id =
      table === "memberships"
        ? "member-a-admin"
        : "isolation-" + table + "-" + crypto.randomUUID();
    if (table !== "memberships")
      await db.withTenant(a, (tx) =>
        tx.save(table, {
          id,
          tenantId: a.tenantId,
          ...(table === "inquiries"
            ? {
                ownerMembershipId: "member-a-admin",
                status: "new",
                nextAction: "Revisar",
                nextActionAt: new Date().toISOString(),
              }
            : {}),
        }),
      );
    await db.withTenant(b, async (tx) => {
      expect(await tx.get(table, id)).toBeNull();
      expect((await tx.list(table)).find((x) => x.id === id)).toBeUndefined();
      await expect(
        tx.save(table, { id: "foreign", tenantId: a.tenantId }),
      ).rejects.toThrow();
      if (table === "assistant_versions" || table === "memberships")
        await expect(tx.remove(table, id)).rejects.toThrow();
      else expect(await tx.remove(table, id)).toBe(false);
    });
    const p = new Pool({
      connectionString: "postgres://inmo_app@127.0.0.1:55432/inmoagent",
    });
    expect((await p.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);
    await p.query("BEGIN");
    await p.query("SELECT set_config('app.tenant_id','tenant-b',true)");
    await expect(
      p.query(
        `INSERT INTO ${table}(tenant_id,id,data) VALUES('tenant-a','raw-foreign',$1)`,
        [{ id: "raw-foreign", tenantId: "tenant-a" }],
      ),
    ).rejects.toThrow();
    await p.query("ROLLBACK");
    await p.query("BEGIN");
    await p.query("SELECT set_config('app.tenant_id','tenant-b',true)");
    if (table === "assistant_versions" || table === "memberships")
      await expect(
        p.query(`UPDATE ${table} SET data=data WHERE tenant_id='tenant-a'`),
      ).rejects.toThrow();
    else {
      expect(
        (await p.query(`SELECT * FROM ${table} WHERE tenant_id='tenant-a'`))
          .rows,
      ).toHaveLength(0);
      expect(
        (
          await p.query(
            `UPDATE ${table} SET data=data WHERE tenant_id='tenant-a'`,
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (await p.query(`DELETE FROM ${table} WHERE tenant_id='tenant-a'`))
          .rowCount,
      ).toBe(0);
    }
    await p.query("ROLLBACK");
    await p.end();
  }
});
test("composite foreign keys reject another tenant owner and rollback resets pooled context", async () => {
  await expect(
    db.withTenant(a, (tx) =>
      tx.save("inquiries", {
        id: "bad-owner",
        tenantId: a.tenantId,
        ownerMembershipId: "member-b-admin",
        status: "new",
        nextAction: "Revisar",
        nextActionAt: new Date().toISOString(),
      }),
    ),
  ).rejects.toThrow();
  await expect(
    db.withTenant(a, async (tx) => {
      await tx.save("audit", { id: "rollback", tenantId: a.tenantId });
      throw Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect(
    await db.withTenant(a, (tx) => tx.get("audit", "rollback")),
  ).toBeNull();
  expect(
    await db.withTenant(b, (tx) => tx.get("memberships", "member-a-admin")),
  ).toBeNull();
});
test("app cannot escalate memberships or persist missing inquiry/accountability and foreign config references", async () => {
  await expect(
    db.withTenant(a, (tx) =>
      tx.save("memberships", {
        id: "member-a-operator",
        tenantId: a.tenantId,
        userId: "user-a-operator",
        role: "admin",
        active: true,
      }),
    ),
  ).rejects.toThrow();
  await expect(
    db.withTenant(a, (tx) =>
      tx.save("inquiries", { id: "missing-fields", tenantId: a.tenantId }),
    ),
  ).rejects.toThrow();
  await expect(
    db.withTenant(a, (tx) =>
      tx.save("public_sessions", {
        id: "foreign-version",
        tenantId: a.tenantId,
        configId: "missing-or-foreign",
      }),
    ),
  ).rejects.toThrow();
  const unsafe = new Database("postgres://postgres@127.0.0.1:55432/inmoagent");
  try {
    await expect(
      unsafe.withTenant(a, (tx) => tx.list("inquiries")),
    ).rejects.toThrow("Rol de aplicación inseguro");
  } finally {
    await unsafe.close();
  }
});

test("membership mismatch fails closed and a released physical connection has no context", async () => {
  for (const patch of [
    { membershipId: "missing" },
    { membershipId: "member-a-operator" },
    { userId: "user-b-admin" },
    { role: "operator" as const },
  ])
    await expect(
      db.withTenant({ ...a, ...patch }, (tx) => tx.list("inquiries")),
    ).rejects.toThrow("Membresía");
  await expect(
    db.withTenant(a, () => {
      throw Error("release-check");
    }),
  ).rejects.toThrow();
  const c = await (db as any).pool.connect();
  try {
    expect(
      (await c.query("SELECT current_setting('app.tenant_id',true) AS tenant"))
        .rows[0].tenant || "",
    ).toBe("");
    expect((await c.query("SELECT * FROM memberships")).rows).toHaveLength(0);
  } finally {
    c.release();
  }
});
