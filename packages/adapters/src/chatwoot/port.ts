import type {
  TenantContext,
  Delivery,
  NormalizedEvent,
  Sender,
} from "../../../domain/src/types.js";
export interface ChatwootPort extends Sender {
  readonly mode: "simulated" | "real";
  ensureConversation(
    ctx: TenantContext,
    id: string,
  ): Promise<{ externalId: string }>;
  reconcile(ctx: TenantContext, key: string): Promise<Delivery>;
  parseEvent(raw: unknown): NormalizedEvent;
  mapping(tenantId: string): { accountId: string; inboxId: string };
}
