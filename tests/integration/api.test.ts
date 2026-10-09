import { beforeAll, afterAll, test, expect } from "vitest";
import { buildApp } from "../../apps/api/src/app.js";
import { Database } from "../../packages/db/src/tenant-transaction.js";
import { migrate } from "../../packages/db/src/migrate.js";
import { SimulatedChatwoot } from "../../packages/adapters/src/chatwoot/simulated.js";
import { DisabledAiAdapter } from "../../packages/adapters/src/ai/disabled.js";
import { a, publish } from "./helpers.js";
const origin = "http://127.0.0.1:5173";
let db: Database, app: ReturnType<typeof buildApp>;
beforeAll(async () => {
  await migrate();
  db = new Database();
  app = buildApp({
    demoMode: true,
    allowedOrigin: origin,
    db,
    chatwoot: new SimulatedChatwoot(db),
    ai: new DisabledAiAdapter(),
  });
});
afterAll(async () => {
  await app.close();
  await db.close();
});
async function login(identity = "a-admin") {
  const r = await app.inject({
    method: "POST",
    url: "/demo/session",
    headers: { origin },
    payload: { identity },
  });
  return {
    origin,
    cookie: "session=" + r.cookies[0]!.value,
    "x-csrf-token": r.json().csrfToken,
  };
}
test("scoped API persists chat, forbids foreign resources and rejects extra fields", async () => {
  const headers = await login(),
    v = await publish(db);
  const session = await app.inject({
    method: "POST",
    url: "/chat/sessions",
    headers,
    payload: { configId: v.id },
  });
  expect(session.statusCode).toBe(200);
  const sid = session.json().id;
  const message = await app.inject({
    method: "POST",
    url: `/chat/sessions/${sid}/messages`,
    headers,
    payload: { text: "Hola", clientMessageId: crypto.randomUUID() },
  });
  expect(message.statusCode).toBe(200);
  const id = message.json().inquiryId;
  expect(
    (await app.inject({ url: "/inquiries/" + id, headers })).statusCode,
  ).toBe(200);
  const b = await login("b-admin");
  expect(
    (await app.inject({ url: "/inquiries/" + id, headers: b })).statusCode,
  ).toBe(404);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/assistant/drafts",
        headers,
        payload: { tenantId: "tenant-b", businessName: "x" },
      })
    ).statusCode,
  ).toBe(400);
  expect((await app.inject("/inquiries")).statusCode).toBe(401);
  const exported = await app.inject({ url: "/inquiries/export", headers: b });
  expect(exported.statusCode).toBe(200);
  expect(exported.body).not.toContain(id);
  expect(
    (await app.inject({ url: "/operation", headers })).json(),
  ).toMatchObject({
    mode: "simulated",
    realAi: false,
    realChatwoot: false,
    whatsappConnected: false,
  });
});
test("public capability accesses only its chat and never panel; Origin still enforced", async () => {
  const headers = await login(),
    v = await publish(db),
    r = await app.inject({
      method: "POST",
      url: "/chat/sessions",
      headers,
      payload: { configId: v.id },
    }),
    id = r.json().id,
    token = r.json().chatToken;
  const publicHeaders = { origin, "x-chat-token": token };
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/public/chat/sessions/${id}/messages`,
        headers: publicHeaders,
        payload: { text: "Consulta", clientMessageId: crypto.randomUUID() },
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (await app.inject({ url: "/inquiries", headers: publicHeaders }))
      .statusCode,
  ).toBe(401);
  expect(
    (
      await app.inject({
        url: "/public/chat/sessions/foreign",
        headers: publicHeaders,
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/public/chat/sessions/${id}/messages`,
        headers: { "x-chat-token": token },
        payload: { text: "Hola", clientMessageId: "x" },
      })
    ).statusCode,
  ).toBe(403);
});

test("manual retry rejects permanent failure even after explicit resume", async () => {
  const headers = await login(),
    v = await publish(db);
  const session = await app.inject({
    method: "POST",
    url: "/chat/sessions",
    headers,
    payload: { configId: v.id },
  });
  const response = await app.inject({
    method: "POST",
    url: `/chat/sessions/${session.json().id}/messages`,
    headers,
    payload: { text: "Hola", clientMessageId: crypto.randomUUID() },
  });
  const cid = response.json().conversationId;
  const job = (await db.withTenant(a, (tx) => tx.list("jobs"))).find(
    (j) => j.conversationId === cid,
  )!;
  const adapter = new SimulatedChatwoot(db);
  adapter.setScenario(a.tenantId, "permanent");
  const { Dispatcher } =
    await import("../../packages/domain/src/jobs/dispatcher.js");
  await new Dispatcher(db, adapter).dispatchJob(a, job.id);
  await app.inject({
    method: "POST",
    url: `/conversations/${cid}/resume`,
    headers,
    payload: {},
  });
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/operation/jobs/${job.id}/retry`,
        headers,
        payload: {},
      })
    ).statusCode,
  ).toBe(409);
});

test("manual transient retry preserves attempts and only expedites eligible pending jobs", async () => {
  const headers = await login(),
    v = await publish(db),
    session = await app.inject({
      method: "POST",
      url: "/chat/sessions",
      headers,
      payload: { configId: v.id },
    });
  const response = await app.inject({
    method: "POST",
    url: `/chat/sessions/${session.json().id}/messages`,
    headers,
    payload: { text: "Hola", clientMessageId: crypto.randomUUID() },
  });
  const job = (await db.withTenant(a, (tx) => tx.list("jobs"))).find(
    (j) => j.conversationId === response.json().conversationId,
  )!;
  const adapter = new SimulatedChatwoot(db);
  adapter.setScenario(a.tenantId, "transient");
  const { Dispatcher } =
    await import("../../packages/domain/src/jobs/dispatcher.js");
  await new Dispatcher(db, adapter).dispatchJob(a, job.id);
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/operation/jobs/${job.id}/retry`,
        headers,
        payload: {},
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (await db.withTenant(a, (tx) => tx.get("jobs", job.id)))?.attempts,
  ).toBe(1);
  adapter.setScenario(a.tenantId, "normal");
  await new Dispatcher(db, adapter).dispatchJob(a, job.id);
  expect((await db.withTenant(a, (tx) => tx.get("jobs", job.id)))?.status).toBe(
    "confirmed",
  );
});
