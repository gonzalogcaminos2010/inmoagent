import type { DbPort, TenantContext, Inquiry } from "../types.js";
import { fail } from "../errors.js";
export class Inquiries {
  constructor(private db: DbPort) {}
  async get(ctx: TenantContext, id: string) {
    return this.db.withTenant(ctx, async (tx) => {
      const q = await tx.get<Inquiry>("inquiries", id);
      if (!q) fail(404, "Consulta no encontrada");
      return q;
    });
  }
  list(ctx: TenantContext) {
    return this.db.withTenant(ctx, (tx) => tx.list<Inquiry>("inquiries"));
  }
  async updateInquiry(
    ctx: TenantContext,
    id: string,
    patch: Pick<
      Inquiry,
      "ownerMembershipId" | "nextAction" | "nextActionAt" | "status" | "result"
    >,
  ) {
    return this.db.withTenant(ctx, async (tx) => {
      const q = await tx.get<Inquiry>("inquiries", id, true);
      if (!q) fail(404, "Consulta no encontrada");
      const owner = await tx.get("memberships", patch.ownerMembershipId);
      if (!owner?.active) fail(400, "Responsable inválido");
      if (patch.status === "closed") {
        if (!patch.result?.trim()) fail(400, "Cerrar exige resultado");
      } else if (
        !patch.nextAction.trim() ||
        !Number.isFinite(Date.parse(patch.nextActionAt))
      )
        fail(400, "Consulta abierta exige próximo paso fechado");
      const updated = {
        ...q,
        ownerMembershipId: patch.ownerMembershipId,
        nextAction: patch.nextAction.trim(),
        nextActionAt: patch.nextActionAt,
        status: patch.status,
        result: patch.result,
      };
      await tx.save("inquiries", updated);
      await tx.save("audit", {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        actor: ctx.membershipId,
        action: "update_inquiry",
        inquiryId: id,
        at: new Date().toISOString(),
      });
      return updated;
    });
  }
}
