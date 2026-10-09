import type {
  DbPort,
  TenantContext,
  NormalizedEvent,
  Conversation,
} from "../../../domain/src/types.js";
import { fail } from "../../../domain/src/errors.js";
import { pauseInTx } from "../../../domain/src/conversations/pause.js";
import type { ChatwootPort } from "./port.js";
export class Events {
  constructor(
    private db: DbPort,
    private port: ChatwootPort,
  ) {}
  async processEvent(
    ctx: TenantContext,
    event: NormalizedEvent,
  ): Promise<"accepted" | "duplicate"> {
    const expected = this.port.mapping(ctx.tenantId);
    if (
      event.accountId !== expected.accountId ||
      event.inboxId !== expected.inboxId
    )
      fail(403, "Account/inbox ajenos");
    const prefix = "sim:" + ctx.tenantId + ":";
    if (!event.conversationExternalId.startsWith(prefix))
      fail(404, "Conversación no encontrada");
    const id = event.conversationExternalId.slice(prefix.length);
    return this.db.withTenant(ctx, async (tx) => {
      await tx.lock("send-gate", true);
      await tx.lock("conversation:" + id);
      await tx.lock("event:" + event.externalId);
      if (
        (await tx.list("events")).some((e) => e.externalId === event.externalId)
      )
        return "duplicate";
      const c = await tx.get<Conversation>("conversations", id);
      if (!c) fail(404, "Conversación no encontrada");
      await tx.save("events", {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        externalId: event.externalId,
        kind: event.kind,
        occurredAt: event.occurredAt,
        conversationId: id,
        mode: "simulated",
      });
      if (event.kind === "human_activity")
        await pauseInTx(
          tx,
          c,
          "Intervención humana simulada",
          new Date().toISOString(),
        );
      return "accepted";
    });
  }
}
