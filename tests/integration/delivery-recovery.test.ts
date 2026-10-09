import { beforeAll, beforeEach, afterAll, test, expect } from "vitest";
import { Database } from "../../packages/db/src/tenant-transaction.js";
import { migrate } from "../../packages/db/src/migrate.js";
import { Intake } from "../../packages/domain/src/conversations/service.js";
import { Dispatcher } from "../../packages/domain/src/jobs/dispatcher.js";
import {
  Recovery,
  scheduleRetry,
} from "../../packages/domain/src/jobs/retry.js";
import { Events } from "../../packages/adapters/src/chatwoot/events.js";
import { SimulatedChatwoot } from "../../packages/adapters/src/chatwoot/simulated.js";
import { a, publish } from "./helpers.js";
let db: Database;
beforeAll(async () => {
  await migrate();
  db = new Database();
});
beforeEach(() =>
  db.withTenant(a, async (tx) => {
    const t = await tx.get("tenants", a.tenantId);
    await tx.save("tenants", { ...t!, paused: false, suspended: false });
    for (const j of await tx.list("jobs"))
      if (["pending", "claimed", "uncertain"].includes(String(j.status)))
        await tx.save("jobs", { ...j, status: "discarded" });
  }),
);
afterAll(() => db.close());
async function queue() {
  const v = await publish(db),
    s = new Intake(db),
    id = await s.createSession(a, v.id),
    m = await s.acceptMessage(a, {
      sessionId: id,
      text: "Hola",
      clientMessageId: crypto.randomUUID(),
    });
  return {
    m,
    j: await db.withTenant(a, async (tx) =>
      (await tx.list("jobs")).find(
        (j) => j.conversationId === m.conversationId,
      )!,
    ),
  };
}
test("retry has five total attempts, bounded window and injected jitter", () => {
  const first = new Date("2026-10-08T00:00Z");
  expect(scheduleRetry(1, first, first, { jitter: () => 0 })?.getTime()).toBe(
    first.getTime() + 1000,
  );
  expect(scheduleRetry(5, first, first, { jitter: () => 0 })).toBeNull();
  expect(
    scheduleRetry(1, first, new Date(first.getTime() + 1800000), {
      jitter: () => 0,
    }),
  ).toBeNull();
});
test("uncertain delivery reconciles after worker restart without another send", async () => {
  const { j, m } = await queue(),
    adapter = new SimulatedChatwoot(db);
  adapter.setScenario(a.tenantId, "uncertain");
  await new Dispatcher(db, adapter).dispatchJob(a, j.id);
  expect((await db.withTenant(a, (tx) => tx.get("jobs", j.id)))?.status).toBe(
    "uncertain",
  );
  const restarted = new SimulatedChatwoot(db);
  await new Recovery(db, new Dispatcher(db, restarted), restarted, [
    a,
  ]).runDueJobs(new Date());
  expect((await db.withTenant(a, (tx) => tx.get("jobs", j.id)))?.status).toBe(
    "confirmed",
  );
  expect(
    (await db.withTenant(a, (tx) => tx.list("messages"))).filter(
      (x) =>
        x.conversationId === m.conversationId && x.direction === "outgoing",
    ),
  ).toHaveLength(1);
});
test("permanent failure goes to human review and duplicate/out-of-order events never resume", async () => {
  const { m, j } = await queue(),
    adapter = new SimulatedChatwoot(db);
  adapter.setScenario(a.tenantId, "permanent");
  await new Dispatcher(db, adapter).dispatchJob(a, j.id);
  expect((await db.withTenant(a, (tx) => tx.get("jobs", j.id)))?.status).toBe(
    "review",
  );
  expect(
    (await db.withTenant(a, (tx) => tx.get("conversations", m.conversationId)))
      ?.paused,
  ).toBe(true);
  const events = new Events(db, adapter),
    mapping = adapter.mapping(a.tenantId),
    event = {
      externalId: crypto.randomUUID(),
      ...mapping,
      conversationExternalId: "sim:" + a.tenantId + ":" + m.conversationId,
      kind: "human_activity" as const,
      occurredAt: new Date().toISOString(),
      payload: {},
    };
  expect(await events.processEvent(a, event)).toBe("accepted");
  expect(await events.processEvent(a, event)).toBe("duplicate");
  await events.processEvent(a, {
    ...event,
    externalId: crypto.randomUUID(),
    kind: "status",
    occurredAt: "2020-01-01T00:00:00Z",
  });
  expect(
    (await db.withTenant(a, (tx) => tx.get("conversations", m.conversationId)))
      ?.paused,
  ).toBe(true);
  await expect(
    events.processEvent(a, { ...event, accountId: "sim-account-tenant-b" }),
  ).rejects.toMatchObject({ statusCode: 403 });
});
test("transient retries reach review on fifth attempt, suspended client sends nothing", async () => {
  const { j } = await queue();
  let now = new Date();
  const adapter = new SimulatedChatwoot(db);
  adapter.setScenario(a.tenantId, "transient");
  const dispatcher = new Dispatcher(db, adapter, { now: () => now });
  for (let attempt = 1; attempt <= 5; attempt++) {
    await dispatcher.dispatchJob(a, j.id);
    const current = await db.withTenant(a, (tx) => tx.get("jobs", j.id));
    expect(current?.attempts).toBe(attempt);
    now = new Date(Date.parse(String(current?.runAt)) + 1000);
  }
  expect((await db.withTenant(a, (tx) => tx.get("jobs", j.id)))?.status).toBe(
    "review",
  );
  const second = await queue();
  await db.withTenant(a, async (tx) => {
    const tenant = await tx.get("tenants", a.tenantId);
    await tx.save("tenants", { ...tenant!, suspended: true });
  });
  let sends = 0;
  await new Dispatcher(db, {
    send: async () => {
      sends++;
      return { status: "confirmed", retryable: false };
    },
  }).dispatchJob(a, second.j.id);
  expect(sends).toBe(0);
});

test("expired transient retry never sends after worker downtime", async () => {
  const { j } = await queue();
  let now = new Date();
  const adapter = new SimulatedChatwoot(db);
  adapter.setScenario(a.tenantId, "transient");
  const dispatcher = new Dispatcher(db, adapter, { now: () => now });
  await dispatcher.dispatchJob(a, j.id);
  now = new Date(now.getTime() + 31 * 60000);
  adapter.setScenario(a.tenantId, "normal");
  await dispatcher.dispatchJob(a, j.id);
  expect((await db.withTenant(a, (tx) => tx.get("jobs", j.id)))?.status).toBe(
    "review",
  );
  expect((await db.withTenant(a, (tx) => tx.get("jobs", j.id)))?.attempts).toBe(
    1,
  );
});

test("crash after durable send receipt recovers once without resending", async () => {
  const { j, m } = await queue();
  const adapter = new SimulatedChatwoot(db);
  let sends = 0;
  const sender = {
    send: async (...args: Parameters<typeof adapter.send>) => {
      sends++;
      return adapter.send(...args);
    },
  };
  const faulty: import("../../packages/domain/src/types.js").DbPort = {
    withTenant: (ctx, fn) =>
      db.withTenant(ctx, (tx) =>
        fn({
          ctx: tx.ctx,
          get: tx.get.bind(tx),
          list: tx.list.bind(tx),
          remove: tx.remove.bind(tx),
          lock: tx.lock.bind(tx),
          reserveBudget: tx.reserveBudget.bind(tx),
          settleBudget: tx.settleBudget.bind(tx),
          save: async (table, record) => {
            if (table === "jobs" && record.status === "confirmed")
              throw new Error("crash after send");
            return tx.save(table, record);
          },
        }),
      ),
  };
  await expect(
    new Dispatcher(faulty, sender).dispatchJob(a, j.id),
  ).rejects.toThrow("crash after send");
  expect((await db.withTenant(a, (tx) => tx.get("jobs", j.id)))?.status).toBe(
    "claimed",
  );
  const restarted = new SimulatedChatwoot(db);
  const restartedSender = {
    send: async (...args: Parameters<typeof restarted.send>) => {
      sends++;
      return restarted.send(...args);
    },
  };
  await new Recovery(db, new Dispatcher(db, restarted), restarted, [
    a,
  ]).runDueJobs(new Date(Date.now() + 61000));
  expect((await db.withTenant(a, (tx) => tx.get("jobs", j.id)))?.status).toBe(
    "confirmed",
  );
  expect(sends).toBe(1);
  expect(
    (await db.withTenant(a, (tx) => tx.list("messages"))).filter(
      (x) =>
        x.conversationId === m.conversationId && x.direction === "outgoing",
    ),
  ).toHaveLength(1);
});
