import { beforeAll, beforeEach, afterAll, test, expect } from "vitest";
import { Database } from "../../packages/db/src/tenant-transaction.js";
import { migrate } from "../../packages/db/src/migrate.js";
import { Intake } from "../../packages/domain/src/conversations/service.js";
import { Pauses } from "../../packages/domain/src/conversations/pause.js";
import { Dispatcher } from "../../packages/domain/src/jobs/dispatcher.js";
import { a, publish } from "./helpers.js";
let db: Database;
beforeAll(async () => {
  await migrate();
  db = new Database();
});
afterAll(() => db.close());
beforeEach(async () => {
  await db.withTenant(a, async (tx) => {
    const t = await tx.get("tenants", a.tenantId);
    await tx.save("tenants", { ...t!, paused: false });
    for (const j of await tx.list("jobs"))
      if (["pending", "claimed"].includes(String(j.status)))
        await tx.save("jobs", { ...j, status: "discarded" });
  });
});
async function queued() {
  const v = await publish(db),
    s = new Intake(db),
    id = await s.createSession(a, v.id);
  const m = await s.acceptMessage(a, {
    sessionId: id,
    text: "Hola",
    clientMessageId: crypto.randomUUID(),
  });
  const j = await db.withTenant(a, async (tx) =>
    (await tx.list("jobs")).find((j) => j.conversationId === m.conversationId)!,
  );
  return { m, j };
}
const deferred = () => {
  let resolve!: (value?: any) => void;
  const promise = new Promise<any>((r) => (resolve = r));
  return { resolve, promise };
};
test("pause after generation prevents send and requires explicit audited resume", async () => {
  const { m, j } = await queued(),
    generated = deferred(),
    release = deferred();
  let sends = 0;
  const worker = new Dispatcher(
    db,
    {
      send: async () => {
        sends++;
        return { status: "confirmed", retryable: false };
      },
    },
    undefined,
    async () => {
      generated.resolve();
      await release.promise;
      return "Simulación";
    },
  );
  const execution = worker.dispatchJob(a, j.id);
  await generated.promise;
  const pauses = new Pauses(db);
  await pauses.pauseConversation(a, m.conversationId, "Operador");
  release.resolve();
  expect((await execution).status).toBe("failed");
  expect(sends).toBe(0);
  await pauses.resumeConversation(a, m.conversationId);
  expect(
    (await db.withTenant(a, (tx) => tx.get("conversations", m.conversationId)))
      ?.paused,
  ).toBe(false);
  expect(
    (await db.withTenant(a, (tx) => tx.list("audit"))).some(
      (x) => x.action === "resume" && x.conversationId === m.conversationId,
    ),
  ).toBe(true);
});
test("pause before claim, human request, global pause and old config suppress sends", async () => {
  const { m, j } = await queued();
  const pauses = new Pauses(db);
  await pauses.pauseConversation(a, m.conversationId, "Humano");
  let sends = 0;
  const worker = new Dispatcher(db, {
    send: async () => {
      sends++;
      return { status: "confirmed", retryable: false };
    },
  });
  await worker.dispatchJob(a, j.id);
  expect(sends).toBe(0);
  const { j: newJob } = await queued();
  await pauses.pauseTenant(a, true);
  await worker.dispatchJob(a, newJob.id);
  expect(sends).toBe(0);
  await pauses.pauseTenant(a, false);
  const v = await publish(db),
    intake = new Intake(db),
    sid = await intake.createSession(a, v.id),
    h = await intake.acceptMessage(a, {
      sessionId: sid,
      text: "Quiero un humano",
      clientMessageId: crypto.randomUUID(),
    });
  expect(h.paused).toBe(true);
  const obsolete = await queued();
  await publish(db);
  await worker.dispatchJob(a, obsolete.j.id);
  expect(sends).toBe(0);
});
test("two workers do not send one logical job twice", async () => {
  const { j } = await queued();
  let sends = 0;
  const worker = new Dispatcher(db, {
    send: async () => {
      sends++;
      return { status: "confirmed", retryable: false };
    },
  });
  await Promise.all([worker.dispatchJob(a, j.id), worker.dispatchJob(a, j.id)]);
  expect(sends).toBe(1);
});
test("an already started send settles before pause; later sends stay blocked", async () => {
  const { m, j } = await queued(),
    entered = deferred(),
    release = deferred();
  let sends = 0;
  const worker = new Dispatcher(db, {
    send: async () => {
      sends++;
      entered.resolve();
      await release.promise;
      return { status: "confirmed", retryable: false };
    },
  });
  const sending = worker.dispatchJob(a, j.id);
  await entered.promise;
  const pausing = new Pauses(db).pauseConversation(
    a,
    m.conversationId,
    "Intervención",
  );
  release.resolve();
  expect((await sending).status).toBe("confirmed");
  expect((await pausing).paused).toBe(true);
  await worker.dispatchJob(a, j.id);
  expect(sends).toBe(1);
});
test("intake during global pause cannot revive on global resume", async () => {
  const v = await publish(db),
    s = new Intake(db),
    id = await s.createSession(a, v.id),
    pauses = new Pauses(db);
  await pauses.pauseTenant(a, true);
  const m = await s.acceptMessage(a, {
    sessionId: id,
    text: "Consulta durante pausa",
    clientMessageId: crypto.randomUUID(),
  });
  expect(m.paused).toBe(true);
  await pauses.pauseTenant(a, false);
  const job = await db.withTenant(a, async (tx) =>
    (await tx.list("jobs")).find((j) => j.conversationId === m.conversationId)!,
  );
  let sends = 0;
  await new Dispatcher(db, {
    send: async () => {
      sends++;
      return { status: "confirmed", retryable: false };
    },
  }).dispatchJob(a, job.id);
  expect(sends).toBe(0);
});
test("resume denies forged membership and another tenant conversation", async () => {
  const { m } = await queued(),
    pauses = new Pauses(db);
  await expect(
    pauses.resumeConversation(
      { ...a, membershipId: "missing" },
      m.conversationId,
    ),
  ).rejects.toMatchObject({ statusCode: 403 });
  await expect(
    pauses.resumeConversation(
      {
        tenantId: "tenant-b",
        membershipId: "member-b-admin",
        userId: "user-b-admin",
        role: "admin",
      },
      m.conversationId,
    ),
  ).rejects.toMatchObject({ statusCode: 404 });
});
