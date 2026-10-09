import { beforeAll, beforeEach, afterAll, test, expect } from "vitest";
import { Pool } from "pg";
import { Database } from "../../packages/db/src/tenant-transaction.js";
import { migrate } from "../../packages/db/src/migrate.js";
import { Budget } from "../../packages/domain/src/usage/budget.js";
import { DisabledAiAdapter } from "../../packages/adapters/src/ai/disabled.js";
import { Intake } from "../../packages/domain/src/conversations/service.js";
import { a, publish } from "./helpers.js";
let db: Database;
beforeAll(async () => {
  await migrate();
  db = new Database();
});
beforeEach(async () => {
  const p = new Pool({
    connectionString: "postgres://postgres@127.0.0.1:55432/inmoagent",
  });
  await p.query("TRUNCATE global_demo_budget,usage,reservations");
  await p.end();
  return db.withTenant(a, async (tx) => {
    const t = await tx.get("tenants", a.tenantId);
    await tx.save("tenants", { ...t!, paused: false, suspended: false });
  });
});
afterAll(() => db.close());
test("atomic concurrent reserves cannot exceed balance; duplicate and settlement are idempotent", async () => {
  const month = 2090 + Math.floor(Math.random() * 100),
    clock = { now: () => new Date(`${month}-01-01T00:00:00Z`) },
    budget = new Budget(db, clock),
    key = crypto.randomUUID();
  const id = await budget.reserveSpend(
    a,
    { estimatedMinor: 8000, currency: "ARS" },
    key,
  );
  expect(
    await budget.reserveSpend(
      a,
      { estimatedMinor: 8000, currency: "ARS" },
      key,
    ),
  ).toBe(id);
  const results = await Promise.allSettled([
    budget.reserveSpend(
      a,
      { estimatedMinor: 1500, currency: "ARS" },
      crypto.randomUUID(),
    ),
    budget.reserveSpend(
      a,
      { estimatedMinor: 1500, currency: "ARS" },
      crypto.randomUUID(),
    ),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  await budget.settleSpend(a, id, 7000);
  await budget.settleSpend(a, id, 7000);
  const usage = await budget.report(a);
  expect(usage.consumedMinor).toBe(7000);
  expect(usage.warning).toBe(true);
  await expect(
    new DisabledAiAdapter().generate(a, "conversation"),
  ).rejects.toThrow("Proveedor no configurado");
});
test("UTC month isolation and reserve release; missing/foreign currency fails", async () => {
  let now = new Date("2400-01-31T23:59:59Z");
  const budget = new Budget(db, { now: () => now }),
    id = await budget.reserveSpend(
      a,
      { estimatedMinor: 100, currency: "ARS" },
      crypto.randomUUID(),
    );
  now = new Date("2400-02-01T00:00:00Z");
  expect((await budget.report(a)).reservedMinor).toBe(0);
  await budget.releaseSpend(a, id);
  await budget.releaseSpend(a, id);
  await expect(
    budget.reserveSpend(
      a,
      { estimatedMinor: 100, currency: "USD" },
      crypto.randomUUID(),
    ),
  ).rejects.toThrow();
});
test("chat limits enforce 20 total and 10 rolling minute messages, with duplicate allowed", async () => {
  let now = new Date(),
    s = new Intake(db, { now: () => now }),
    v = await publish(db),
    sid = await s.createSession(a, v.id);
  const first = {
    sessionId: sid,
    text: "Hola",
    clientMessageId: crypto.randomUUID(),
  };
  await s.acceptMessage(a, first);
  for (let i = 1; i < 10; i++)
    await s.acceptMessage(a, {
      ...first,
      clientMessageId: crypto.randomUUID(),
    });
  await expect(
    s.acceptMessage(a, { ...first, clientMessageId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ statusCode: 429 });
  await s.acceptMessage(a, first);
  now = new Date(now.getTime() + 60001);
  for (let i = 0; i < 10; i++)
    await s.acceptMessage(a, {
      ...first,
      clientMessageId: crypto.randomUUID(),
    });
  now = new Date(now.getTime() + 60001);
  await expect(
    s.acceptMessage(a, { ...first, clientMessageId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ statusCode: 429 });
});
test("discrepancy remains blocked after settling another reservation", async () => {
  const budget = new Budget(db, { now: () => new Date("2500-01-01T00:00Z") }),
    first = await budget.reserveSpend(
      a,
      { estimatedMinor: 100, currency: "ARS" },
      crypto.randomUUID(),
    ),
    second = await budget.reserveSpend(
      a,
      { estimatedMinor: 100, currency: "ARS" },
      crypto.randomUUID(),
    );
  await budget.settleSpend(a, first, 150);
  await budget.settleSpend(a, second, 50);
  expect((await budget.report(a)).blocked).toBe(true);
});
test("global reserve cap serializes different tenants", async () => {
  const p = new Pool({
    connectionString: "postgres://postgres@127.0.0.1:55432/inmoagent",
  });
  await p.query(
    "INSERT INTO global_demo_budget(period,currency,cap) VALUES('2501-01','ARS',10000)",
  );
  await p.end();
  const budget = new Budget(db, { now: () => new Date("2501-01-01T00:00Z") });
  const b = {
    tenantId: "tenant-b",
    userId: "user-b-admin",
    membershipId: "member-b-admin",
    role: "admin" as const,
  };
  const results = await Promise.allSettled([
    budget.reserveSpend(
      a,
      { estimatedMinor: 6000, currency: "ARS" },
      crypto.randomUUID(),
    ),
    budget.reserveSpend(
      b,
      { estimatedMinor: 6000, currency: "ARS" },
      crypto.randomUUID(),
    ),
  ]);
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
});
test("only two tenant jobs may generate simultaneously", async () => {
  const { Dispatcher } =
    await import("../../packages/domain/src/jobs/dispatcher.js");
  await db.withTenant(a, async (tx) => {
    for (const j of await tx.list("jobs"))
      if (["pending", "claimed"].includes(String(j.status)))
        await tx.save("jobs", { ...j, status: "discarded" });
  });
  const v = await publish(db),
    s = new Intake(db),
    id = await s.createSession(a, v.id);
  let cid = "";
  for (let i = 0; i < 3; i++)
    cid = (
      await s.acceptMessage(a, {
        sessionId: id,
        text: "Hola",
        clientMessageId: crypto.randomUUID(),
      })
    ).conversationId;
  const jobs = await db.withTenant(a, async (tx) =>
    (await tx.list("jobs")).filter((j) => j.conversationId === cid),
  );
  let generated = 0,
    started!: () => void,
    release!: () => void;
  const startedPromise = new Promise<void>((r) => (started = r)),
    gate = new Promise<void>((r) => (release = r));
  const worker = new Dispatcher(
    db,
    { send: async () => ({ status: "confirmed", retryable: false }) },
    undefined,
    async () => {
      if (++generated === 2) started();
      await gate;
      return "Simulación";
    },
  );
  const first = worker.dispatchJob(a, jobs[0]!.id),
    second = worker.dispatchJob(a, jobs[1]!.id);
  await startedPromise;
  await worker.dispatchJob(a, jobs[2]!.id);
  expect(generated).toBe(2);
  release();
  await Promise.all([first, second]);
});
