import type {
  DbPort,
  TenantContext,
  AssistantDraft,
  DraftRecord,
  AssistantVersion,
  RecordData,
  Clock,
} from "../types.js";
import { requireAdmin, fail } from "../errors.js";
import { validateDraft, readiness } from "./activation.js";
import { simulate } from "./simulation.js";
export class Wizard {
  constructor(
    private db: DbPort,
    private clock: Clock = { now: () => new Date() },
  ) {}
  async saveDraft(ctx: TenantContext, draft: AssistantDraft, id?: string) {
    requireAdmin(ctx);
    return this.db.withTenant(ctx, async (tx) => {
      if (id) await tx.lock("draft:" + id);
      const old = id ? await tx.get<DraftRecord>("assistant_drafts", id) : null;
      if (id && !old) fail(404, "Borrador no encontrado");
      // Borradores incompletos pueden guardarse; la prueba exige completitud.
      if (draft.ownerMembershipId) {
        const owner = await tx.get("memberships", draft.ownerMembershipId);
        if (!owner?.active) fail(400, "Responsable inválido");
      }
      const record = {
        ...draft,
        id: id ?? crypto.randomUUID(),
        tenantId: ctx.tenantId,
        revision: (old?.revision ?? 0) + 1,
      };
      await tx.save("assistant_drafts", record);
      return record.id;
    });
  }
  async testDraft(ctx: TenantContext, id: string, prompt: string) {
    requireAdmin(ctx);
    return this.db.withTenant(ctx, async (tx) => {
      await tx.lock("draft:" + id);
      const d = await tx.get<DraftRecord>("assistant_drafts", id);
      if (!d) fail(404, "Borrador no encontrado");
      validateDraft(d);
      const result = {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        configId: id,
        configRevision: d.revision,
        mode: "simulated" as const,
        reply: simulate(d, prompt),
      };
      await tx.save("assistant_tests", result);
      return { ...result, testId: result.id };
    });
  }
  async publish(
    ctx: TenantContext,
    id: string,
    testId: string,
    key: string,
  ): Promise<AssistantVersion> {
    requireAdmin(ctx);
    return this.db.withTenant(ctx, async (tx) => {
      await tx.lock("send-gate");
      await tx.lock("publication");
      const versions = await tx.list<AssistantVersion>("assistant_versions");
      const previous = versions.find((v) => v.publicationKey === key);
      if (previous) {
        if (previous.draftId !== id) fail(409, "Clave de publicación usada");
        return previous;
      }
      await tx.lock("draft:" + id);
      const d = await tx.get<DraftRecord>("assistant_drafts", id);
      if (!d) fail(404, "Borrador no encontrado");
      validateDraft(d);
      const owner = await tx.get("memberships", d.ownerMembershipId);
      if (!owner?.active) fail(400, "Responsable inválido");
      const t = await tx.get<RecordData>("assistant_tests", testId);
      if (!t || t.configId !== id || t.configRevision !== d.revision)
        fail(409, "Probá la revisión exacta antes de publicar");
      if (d.mode !== "simulated")
        fail(
          409,
          "Activación real bloqueada: " +
            readiness(d, true).blockers.join("; "),
        );
      const v: AssistantVersion = {
        ...d,
        id: crypto.randomUUID(),
        draftId: id,
        version: Math.max(0, ...versions.map((v) => v.version ?? 0)) + 1,
        approvedBy: ctx.membershipId,
        publishedAt: this.clock.now().toISOString(),
        publicationKey: key,
      };
      await tx.save("assistant_versions", v);
      await tx.save("audit", {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        actor: ctx.membershipId,
        action: "publish",
        configId: v.id,
        at: v.publishedAt,
      });
      return v;
    });
  }
  async getReadiness(ctx: TenantContext, id: string) {
    return this.db.withTenant(ctx, async (tx) => {
      const d = await tx.get<DraftRecord>("assistant_drafts", id);
      if (!d) fail(404, "Borrador no encontrado");
      return readiness(d, true);
    });
  }
}
