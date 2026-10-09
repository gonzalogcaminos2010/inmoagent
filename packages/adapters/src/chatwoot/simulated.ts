import { createHash } from "node:crypto";
import type {
  DbPort,
  TenantContext,
  Delivery,
  NormalizedEvent,
  RecordData,
} from "../../../domain/src/types.js";
import { fail } from "../../../domain/src/errors.js";
import type { ChatwootPort } from "./port.js";
export type Scenario =
  "normal" | "uncertain" | "transient" | "permanent" | "unreconcilable";
export class SimulatedChatwoot implements ChatwootPort {
  readonly mode = "simulated" as const;
  private receipts = new Map<string, Delivery>();
  private scenarios = new Map<string, Scenario>();
  constructor(private db?: DbPort) {}
  mapping(tenantId: string) {
    if (!["tenant-a", "tenant-b"].includes(tenantId))
      fail(403, "Cliente de simulación inválido");
    return {
      accountId: "sim-account-" + tenantId,
      inboxId: "sim-inbox-" + tenantId,
    };
  }
  setScenario(tenantId: string, scenario: Scenario) {
    this.mapping(tenantId);
    this.scenarios.set(tenantId, scenario);
  }
  async ensureConversation(ctx: TenantContext, id: string) {
    this.mapping(ctx.tenantId);
    return { externalId: "sim:" + ctx.tenantId + ":" + id };
  }
  private key(ctx: TenantContext, key: string) {
    return (
      "sim-delivery-" +
      createHash("sha256")
        .update(ctx.tenantId + ":" + key)
        .digest("hex")
    );
  }
  private async read(
    ctx: TenantContext,
    key: string,
  ): Promise<Delivery | undefined> {
    if (this.db) {
      const r = await this.db.withTenant(ctx, (tx) =>
        tx.get<RecordData>("events", key),
      );
      return r?.delivery as Delivery | undefined;
    }
    return this.receipts.get(key);
  }
  private async store(ctx: TenantContext, key: string, delivery: Delivery) {
    if (this.db)
      await this.db.withTenant(ctx, (tx) =>
        tx.save("events", {
          id: key,
          tenantId: ctx.tenantId,
          externalId: key,
          kind: "simulated_delivery",
          delivery,
        }),
      );
    else this.receipts.set(key, delivery);
  }
  async send(
    ctx: TenantContext,
    id: string,
    _text: string,
    key: string,
  ): Promise<Delivery> {
    await this.ensureConversation(ctx, id);
    const receiptKey = this.key(ctx, key),
      old = await this.read(ctx, receiptKey);
    if (old?.status === "confirmed") return old;
    const scenario = this.scenarios.get(ctx.tenantId) ?? "normal";
    if (scenario === "permanent") return { status: "failed", retryable: false };
    if (scenario === "transient") return { status: "failed", retryable: true };
    if (scenario === "unreconcilable")
      return { status: "uncertain", retryable: false };
    const confirmed: Delivery = {
      status: "confirmed",
      externalId: receiptKey,
      retryable: false,
    };
    await this.store(ctx, receiptKey, confirmed);
    return scenario === "uncertain"
      ? { status: "uncertain", retryable: false }
      : confirmed;
  }
  async reconcile(ctx: TenantContext, key: string) {
    this.mapping(ctx.tenantId);
    return (
      (await this.read(ctx, this.key(ctx, key))) ?? {
        status: "uncertain" as const,
        retryable: false,
      }
    );
  }
  parseEvent(raw: unknown): NormalizedEvent {
    if (!raw || typeof raw !== "object") fail(400, "Evento inválido");
    const r = raw as Record<string, unknown>;
    for (const key of [
      "externalId",
      "accountId",
      "inboxId",
      "conversationExternalId",
      "occurredAt",
    ])
      if (typeof r[key] !== "string" || !r[key]) fail(400, "Evento inválido");
    if (
      !["message", "human_activity", "status"].includes(String(r.kind)) ||
      !Number.isFinite(Date.parse(String(r.occurredAt)))
    )
      fail(400, "Evento inválido");
    return r as NormalizedEvent;
  }
}
