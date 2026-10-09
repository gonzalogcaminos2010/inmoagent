import { randomBytes } from "node:crypto";
import type {
  Clock,
  TenantContext,
} from "../../../../packages/domain/src/types.js";
export function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}
export function assertLoopback(host: string) {
  if (!["127.0.0.1", "::1", "localhost"].includes(host))
    fail(400, "Demo sólo disponible en loopback");
}
export const identities = {
  "a-admin": {
    tenantId: "tenant-a",
    userId: "user-a-admin",
    membershipId: "member-a-admin",
    role: "admin",
  },
  "a-operator": {
    tenantId: "tenant-a",
    userId: "user-a-operator",
    membershipId: "member-a-operator",
    role: "operator",
  },
  "b-admin": {
    tenantId: "tenant-b",
    userId: "user-b-admin",
    membershipId: "member-b-admin",
    role: "admin",
  },
} as const;
export class Sessions {
  private records = new Map<
    string,
    { ctx: TenantContext; csrfToken: string; expires: number }
  >();
  constructor(private clock: Clock = { now: () => new Date() }) {}
  async createDemoSession(identity: keyof typeof identities) {
    if (!identities[identity]) fail(400, "Identidad ficticia inválida");
    const sessionId = randomBytes(32).toString("hex"),
      csrfToken = randomBytes(32).toString("hex");
    this.records.set(sessionId, {
      ctx: { ...identities[identity] },
      csrfToken,
      expires: this.clock.now().getTime() + 7200000,
    });
    return { sessionId, csrfToken };
  }
  async resolveSession(sessionId: string): Promise<TenantContext> {
    const s = this.records.get(sessionId);
    if (!s || s.expires <= this.clock.now().getTime()) {
      this.records.delete(sessionId);
      fail(401, "Sesión vencida o ausente");
    }
    return { ...s.ctx };
  }
  async revokeSession(sessionId: string) {
    this.records.delete(sessionId);
  }
  async csrf(sessionId: string, token: unknown) {
    await this.resolveSession(sessionId);
    if (this.records.get(sessionId)?.csrfToken !== token)
      fail(403, "CSRF inválido");
  }
  token(sessionId: string) {
    return this.records.get(sessionId)?.csrfToken;
  }
}
