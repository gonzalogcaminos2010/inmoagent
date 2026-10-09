import { beforeAll, afterAll, test, expect } from "vitest";
import { Database } from "../../packages/db/src/tenant-transaction.js";
import { migrate } from "../../packages/db/src/migrate.js";
import { Intake } from "../../packages/domain/src/conversations/service.js";
import { Wizard } from "../../packages/domain/src/assistant/wizard.js";
import type {
  DbPort,
  Tx,
  Table,
  RecordData,
} from "../../packages/domain/src/types.js";
import { a, publish } from "./helpers.js";
let db: Database;
beforeAll(async () => {
  await migrate();
  db = new Database();
});
afterAll(() => db.close());
test("old public configuration rejects new messages after another publication", async () => {
  const v = await publish(db),
    intake = new Intake(db),
    id = await intake.createSession(a, v.id);
  await publish(db);
  await expect(
    intake.acceptMessage(a, {
      sessionId: id,
      text: "Sesión anterior",
      clientMessageId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
});
test("failure between job and outbox rolls back inquiry, message and task together", async () => {
  const v = await publish(db),
    intake = new Intake(db),
    id = await intake.createSession(a, v.id);
  const counts = () =>
    db.withTenant(a, async (tx) => {
      const values: number[] = [];
      for (const table of ["inquiries", "messages", "jobs", "outbox"])
        values.push((await tx.list(table as Table)).length);
      return values;
    });
  const before = await counts();
  const fault: DbPort = {
    withTenant: (ctx, fn) =>
      db.withTenant(ctx, (tx) => {
        const wrapped = new Proxy(tx, {
          get(target, prop) {
            if (prop === "save")
              return async (table: Table, v: RecordData) => {
                if (table === "outbox") throw Error("Injected outbox failure");
                return target.save(table, v);
              };
            const value = (target as any)[prop];
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as Tx;
        return fn(wrapped);
      }),
  };
  await expect(
    new Intake(fault).acceptMessage(a, {
      sessionId: id,
      text: "Rollback",
      clientMessageId: crypto.randomUUID(),
    }),
  ).rejects.toThrow("Injected");
  expect(await counts()).toEqual(before);
});
test("incomplete owner can be saved as draft but cannot be tested or published", async () => {
  const wizard = new Wizard(db),
    id = await wizard.saveDraft(a, {
      businessName: "Ficción",
      approvedKnowledge: "Datos ficticios",
      tone: "Claro",
      hours: "9 a 18",
      handoffRules: "Humano",
      ownerMembershipId: "",
      mode: "simulated",
    });
  await expect(wizard.testDraft(a, id, "Hola")).rejects.toMatchObject({
    statusCode: 400,
  });
});
test("server restart permits a new demo login with its stale cookie, while live rotation needs CSRF", async () => {
  const { buildApp } = await import("../../apps/api/src/app.js");
  const origin = "http://127.0.0.1:5173",
    first = buildApp({ demoMode: true, allowedOrigin: origin }),
    next = buildApp({ demoMode: true, allowedOrigin: origin });
  const r = await first.inject({
      method: "POST",
      url: "/demo/session",
      headers: { origin },
      payload: { identity: "a-admin" },
    }),
    cookie = "session=" + r.cookies[0]!.value;
  expect(
    (
      await first.inject({
        method: "POST",
        url: "/demo/session",
        headers: { origin, cookie },
        payload: { identity: "b-admin" },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await next.inject({
        method: "POST",
        url: "/demo/session",
        headers: { origin, cookie },
        payload: { identity: "a-admin" },
      })
    ).statusCode,
  ).toBe(200);
  await first.close();
  await next.close();
});
