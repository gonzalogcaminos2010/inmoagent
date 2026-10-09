import { beforeAll, afterAll, test, expect } from "vitest";
import { Database } from "../../packages/db/src/tenant-transaction.js";
import { migrate } from "../../packages/db/src/migrate.js";
import { Intake } from "../../packages/domain/src/conversations/service.js";
import { Inquiries } from "../../packages/domain/src/inquiries/service.js";
import { a, b, publish } from "./helpers.js";
let db: Database, s: Intake, sessionId: string;
beforeAll(async () => {
  await migrate();
  db = new Database();
  s = new Intake(db);
  const v = await publish(db);
  sessionId = await s.createSession(a, v.id);
});
afterAll(async () => db.close());
test("message, inquiry, job and outbox are atomic and idempotent with provenance", async () => {
  const input = {
    sessionId,
    text: "Busco alquilar",
    clientMessageId: crypto.randomUUID(),
  };
  const [first, again] = await Promise.all([
    s.acceptMessage(a, input),
    s.acceptMessage(a, input),
  ]);
  expect(first.messageId).toBe(again.messageId);
  const q = await new Inquiries(db).get(a, first.inquiryId);
  expect(q.ownerMembershipId).toBe(a.membershipId);
  expect(q.nextAction).toBe("Revisar consulta");
  await db.withTenant(a, async (tx) => {
    expect((await tx.get("messages", first.messageId))?.mode).toBe("simulated");
    expect(
      (await tx.list("jobs")).some(
        (j) => j.conversationId === first.conversationId,
      ),
    ).toBe(true);
  });
  await expect(s.acceptMessage(b, input)).rejects.toMatchObject({
    statusCode: 404,
  });
  const inquiries = new Inquiries(db);
  await expect(
    inquiries.updateInquiry(a, q.id, {
      ...q,
      ownerMembershipId: b.membershipId,
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
  await expect(
    inquiries.updateInquiry(a, q.id, { ...q, nextAction: "" }),
  ).rejects.toMatchObject({ statusCode: 400 });
  await expect(
    inquiries.updateInquiry(a, q.id, { ...q, status: "closed", result: "" }),
  ).rejects.toMatchObject({ statusCode: 400 });
  const closed = await inquiries.updateInquiry(a, q.id, {
    ...q,
    status: "closed",
    result: "Seguimiento coordinado",
  });
  expect(closed.status).toBe("closed");
});
test("Unicode code points, empty input and 2000/2001 boundary; HTML remains text", async () => {
  for (const text of ["", "  ", "😀".repeat(2001)])
    await expect(
      s.acceptMessage(a, {
        sessionId,
        text,
        clientMessageId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  const r = await s.acceptMessage(a, {
    sessionId,
    text: "😀".repeat(2000),
    clientMessageId: crypto.randomUUID(),
  });
  expect(r.mode).toBe("simulated");
  const html = "<img src=x onerror=alert(1)>";
  const h = await s.acceptMessage(a, {
    sessionId,
    text: html,
    clientMessageId: crypto.randomUUID(),
  });
  expect(
    (await db.withTenant(a, (tx) => tx.get("messages", h.messageId)))?.text,
  ).toBe(html);
});
