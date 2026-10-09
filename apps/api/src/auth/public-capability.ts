import { randomBytes } from "node:crypto";
import type {
  TenantContext,
  Clock,
} from "../../../../packages/domain/src/types.js";
import { fail } from "../../../../packages/domain/src/errors.js";
export class PublicCapabilities {
  private records = new Map<
    string,
    { ctx: TenantContext; sessionId: string; expires: number }
  >();
  constructor(private clock: Clock = { now: () => new Date() }) {}
  create(ctx: TenantContext, sessionId: string) {
    const token = randomBytes(32).toString("hex");
    this.records.set(token, {
      ctx: { ...ctx },
      sessionId,
      expires: this.clock.now().getTime() + 7200000,
    });
    return token;
  }
  resolve(token: unknown, sessionId: string) {
    const s = typeof token === "string" ? this.records.get(token) : undefined;
    if (!s || s.expires <= this.clock.now().getTime())
      fail(401, "Sesión pública vencida o ausente");
    if (s.sessionId !== sessionId) fail(404, "Sesión de chat no encontrada");
    return { ...s.ctx };
  }
}
