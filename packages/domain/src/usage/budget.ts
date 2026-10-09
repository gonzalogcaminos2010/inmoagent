import type { DbPort, TenantContext, Clock } from "../types.js";
import { fail } from "../errors.js";
export type Spend = { estimatedMinor: number; currency: string };
export class Budget {
  constructor(
    private db: DbPort,
    private clock: Clock = { now: () => new Date() },
  ) {}
  private period() {
    return this.clock.now().toISOString().slice(0, 7);
  }
  async reserveSpend(ctx: TenantContext, spend: Spend, key: string) {
    if (
      !Number.isSafeInteger(spend.estimatedMinor) ||
      spend.estimatedMinor <= 0 ||
      !key
    )
      fail(400, "Reserva inválida");
    try {
      return await this.db.withTenant(ctx, (tx) =>
        tx.reserveBudget(
          crypto.randomUUID(),
          key,
          this.period(),
          spend.estimatedMinor,
          spend.currency,
        ),
      );
    } catch (e) {
      if ((e as Error).message === "Presupuesto agotado") {
        await this.pause(ctx);
        fail(429, "Presupuesto de prueba agotado; atención humana requerida");
      }
      throw e;
    }
  }
  async settleSpend(ctx: TenantContext, id: string, actualMinor: number) {
    if (!Number.isSafeInteger(actualMinor) || actualMinor < 0)
      fail(400, "Costo inválido");
    await this.db.withTenant(ctx, (tx) =>
      tx.settleBudget(id, actualMinor, false),
    );
    const status = await this.report(ctx);
    if (status.discrepancy) await this.pause(ctx);
  }
  releaseSpend(ctx: TenantContext, id: string) {
    return this.db.withTenant(ctx, (tx) => tx.settleBudget(id, 0, true));
  }
  async report(ctx: TenantContext) {
    return this.db.withTenant(ctx, async (tx) => {
      const u = await tx.get("usage", this.period() + ":ARS");
      const reservedMinor = Number(u?.reservedMinor ?? 0),
        consumedMinor = Number(u?.consumedMinor ?? 0),
        limitMinor = Number(u?.limitMinor ?? 10000);
      return {
        period: this.period(),
        currency: "ARS",
        reservedMinor,
        consumedMinor,
        limitMinor,
        warning: reservedMinor + consumedMinor >= limitMinor * 0.8,
        blocked:
          Boolean(u?.blocked) || reservedMinor + consumedMinor >= limitMinor,
        discrepancy: Boolean(u?.discrepancy),
        realProviderConfigured: false,
      };
    });
  }
  private async pause(ctx: TenantContext) {
    await this.db.withTenant(ctx, async (tx) => {
      await tx.lock("send-gate");
      const t = await tx.get("tenants", ctx.tenantId);
      if (t)
        await tx.save("tenants", {
          ...t,
          paused: true,
          pauseReason: "Presupuesto de prueba",
        });
      for (const j of await tx.list("jobs"))
        if (["pending", "claimed"].includes(String(j.status)))
          await tx.save("jobs", { ...j, status: "discarded" });
      await tx.save("audit", {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        action: "budget_pause",
        actor: ctx.membershipId,
        at: this.clock.now().toISOString(),
      });
    });
  }
}
