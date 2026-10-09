import { beforeAll, afterAll, test, expect } from "vitest";
import { Database } from "../../packages/db/src/tenant-transaction.js";
import { migrate } from "../../packages/db/src/migrate.js";
import { Wizard } from "../../packages/domain/src/assistant/wizard.js";
const ctx = {
  tenantId: "tenant-a",
  userId: "user-a-admin",
  membershipId: "member-a-admin",
  role: "admin" as const,
};
const draft = {
  businessName: "Río",
  approvedKnowledge:
    "Datos ficticios: coordinamos atención sin prometer disponibilidad.",
  tone: "Cercano",
  hours: "9 a 18",
  handoffRules: "Pedir humano",
  ownerMembershipId: "member-a-admin",
  mode: "simulated" as const,
};
let db: Database, w: Wizard;
beforeAll(async () => {
  await migrate();
  db = new Database();
  w = new Wizard(db);
});
afterAll(async () => db.close());
test("exact revision required and double publication returns one immutable version", async () => {
  const id = await w.saveDraft(ctx, draft);
  const first = await w.testDraft(ctx, id, "Hola");
  await w.saveDraft(ctx, { ...draft, tone: "Formal" }, id);
  await expect(w.publish(ctx, id, first.testId, "old")).rejects.toMatchObject({
    statusCode: 409,
  });
  const current = await w.testDraft(ctx, id, "Hola"),
    key = crypto.randomUUID();
  const [a, b] = await Promise.all([
    w.publish(ctx, id, current.testId, key),
    w.publish(ctx, id, current.testId, key),
  ]);
  expect(a.id).toBe(b.id);
  expect(a.version).toBeGreaterThan(0);
  await expect(
    w.publish(
      {
        ...ctx,
        userId: "user-a-operator",
        membershipId: "member-a-operator",
        role: "operator",
      },
      id,
      current.testId,
      key,
    ),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect((await w.getReadiness(ctx, id)).responding).toBe(false);
});
