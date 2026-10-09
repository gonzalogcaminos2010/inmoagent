import type {
  DbPort,
  TenantContext,
  Conversation,
  Job,
  Tx,
  Clock,
  Inquiry,
} from "../types.js";
import { fail, requireAdmin } from "../errors.js";
export async function pauseInTx(
  tx: Tx,
  conversation: Conversation,
  reason: string,
  at: string,
) {
  const paused = {
    ...conversation,
    paused: true,
    revision: conversation.revision + 1,
    pauseReason: reason,
    handoffStatus: "pending" as const,
  };
  await tx.save("conversations", paused);
  for (const j of await tx.list<Job>("jobs"))
    if (
      j.conversationId === paused.id &&
      ["pending", "claimed"].includes(j.status)
    )
      await tx.save("jobs", { ...j, status: "discarded" });
  const q = await tx.get<Inquiry>("inquiries", paused.inquiryId);
  if (q)
    await tx.save("inquiries", {
      ...q,
      status: "active",
      nextAction: "Atender pase humano",
      nextActionAt: at,
    });
  await tx.save("audit", {
    id: crypto.randomUUID(),
    tenantId: tx.ctx.tenantId,
    actor: tx.ctx.membershipId,
    action: "pause",
    conversationId: paused.id,
    reason,
    at,
  });
  return paused;
}
export class Pauses {
  constructor(
    private db: DbPort,
    private clock: Clock = { now: () => new Date() },
  ) {}
  async pauseConversation(ctx: TenantContext, id: string, reason: string) {
    return this.db.withTenant(ctx, async (tx) => {
      await tx.lock("send-gate", true);
      await tx.lock("conversation:" + id);
      const c = await tx.get<Conversation>("conversations", id);
      if (!c) fail(404, "Conversación no encontrada");
      return pauseInTx(tx, c, reason, this.clock.now().toISOString());
    });
  }
  async resumeConversation(ctx: TenantContext, id: string) {
    return this.db.withTenant(ctx, async (tx) => {
      await tx.lock("send-gate", true);
      await tx.lock("conversation:" + id);
      const c = await tx.get<Conversation>("conversations", id);
      if (!c) fail(404, "Conversación no encontrada");
      const updated = {
        ...c,
        paused: false,
        revision: c.revision + 1,
        pauseReason: undefined,
      };
      await tx.save("conversations", updated);
      await tx.save("audit", {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        actor: ctx.membershipId,
        action: "resume",
        conversationId: id,
        at: this.clock.now().toISOString(),
      });
      return updated;
    });
  }
  async pauseTenant(ctx: TenantContext, paused: boolean) {
    requireAdmin(ctx);
    return this.db.withTenant(ctx, async (tx) => {
      await tx.lock("send-gate");
      const tenant = await tx.get("tenants", ctx.tenantId);
      if (!tenant) fail(404, "Cliente no encontrado");
      await tx.save("tenants", { ...tenant, paused });
      if (paused)
        for (const j of await tx.list<Job>("jobs"))
          if (["pending", "claimed"].includes(j.status))
            await tx.save("jobs", { ...j, status: "discarded" });
      await tx.save("audit", {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        actor: ctx.membershipId,
        action: paused ? "pause_tenant" : "resume_tenant",
        at: this.clock.now().toISOString(),
      });
      return { paused };
    });
  }
}
