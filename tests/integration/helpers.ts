import { Database } from "../../packages/db/src/tenant-transaction.js";
import { Wizard } from "../../packages/domain/src/assistant/wizard.js";
export const a = {
  tenantId: "tenant-a",
  userId: "user-a-admin",
  membershipId: "member-a-admin",
  role: "admin" as const,
};
export const b = {
  tenantId: "tenant-b",
  userId: "user-b-admin",
  membershipId: "member-b-admin",
  role: "admin" as const,
};
export async function publish(db: Database, ctx = a) {
  await db.withTenant(ctx, async (tx) => {
    const t = await tx.get("tenants", ctx.tenantId);
    await tx.save("tenants", { ...t!, paused: false, suspended: false });
  });
  const w = new Wizard(db);
  const id = await w.saveDraft(ctx, {
    businessName: "Ficción",
    approvedKnowledge: "Ejemplo ficticio: atención coordinada por el equipo.",
    tone: "Cercano",
    hours: "9 a 18",
    handoffRules: "Pedir humano",
    ownerMembershipId: ctx.membershipId,
    mode: "simulated",
  });
  const t = await w.testDraft(ctx, id, "Hola");
  return w.publish(ctx, id, t.testId, crypto.randomUUID());
}
