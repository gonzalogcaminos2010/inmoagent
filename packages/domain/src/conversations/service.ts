import type {
  DbPort,
  TenantContext,
  AssistantVersion,
  ChatSession,
  Conversation,
  Inquiry,
  IncomingMessage,
  AcceptedMessage,
  Clock,
  RecordData,
  Job,
} from "../types.js";
import { fail } from "../errors.js";
import { requestsHuman } from "../assistant/simulation.js";
import { pauseInTx } from "./pause.js";
export class Intake {
  constructor(
    private db: DbPort,
    private clock: Clock = { now: () => new Date() },
  ) {}
  async createSession(ctx: TenantContext, configId: string) {
    return this.db.withTenant(ctx, async (tx) => {
      await tx.lock("send-gate", true);
      const versions = (
        await tx.list<AssistantVersion>("assistant_versions")
      ).filter((v) => typeof v.version === "number");
      const latest = versions.sort((a, b) => b.version - a.version)[0];
      if (latest?.id !== configId)
        fail(409, "La configuración cambió: abrí una nueva sesión");
      const config = await tx.get<AssistantVersion>(
        "assistant_versions",
        configId,
      );
      if (!config || config.mode !== "simulated")
        fail(404, "Configuración simulada no encontrada");
      const owner = await tx.get("memberships", config.ownerMembershipId);
      if (!owner?.active) fail(409, "Falta responsable válido");
      const session: ChatSession = {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        configId,
        messageCount: 0,
        messageTimes: [],
        expiresAt: new Date(this.clock.now().getTime() + 7200000).toISOString(),
      };
      await tx.save("public_sessions", session);
      return session.id;
    });
  }
  async acceptMessage(
    ctx: TenantContext,
    input: IncomingMessage,
  ): Promise<AcceptedMessage> {
    if (!input.text.trim() || [...input.text].length > 2000)
      fail(400, "Mensaje debe tener 1 a 2.000 caracteres");
    if (!input.clientMessageId.trim())
      fail(400, "Falta identificador de mensaje");
    return this.db.withTenant(ctx, async (tx) => {
      await tx.lock("send-gate", true);
      await tx.lock("session:" + input.sessionId);
      const session = await tx.get<ChatSession>(
        "public_sessions",
        input.sessionId,
      );
      if (!session) fail(404, "Sesión de chat no encontrada");
      const tenant = await tx.get("tenants", ctx.tenantId);
      const tenantPaused = Boolean(tenant?.paused || tenant?.suspended);
      const now = this.clock.now();
      if (Date.parse(session.expiresAt) <= now.getTime())
        fail(401, "Sesión de chat vencida");
      const prior = (await tx.list<RecordData>("messages")).find(
        (m) =>
          m.conversationId === session.conversationId &&
          m.clientMessageId === input.clientMessageId,
      );
      if (prior) {
        const conversation = await tx.get<Conversation>(
          "conversations",
          String(prior.conversationId),
        );
        return {
          messageId: prior.id,
          inquiryId: conversation!.inquiryId,
          conversationId: conversation!.id,
          mode: "simulated",
          paused: conversation!.paused,
        };
      }
      if (session.messageCount >= 20)
        fail(429, "Límite de 20 mensajes por sesión");
      if (
        session.messageTimes.filter((t) => t > now.getTime() - 60000).length >=
        10
      )
        fail(429, "Límite de 10 mensajes por minuto");
      const versions = (
        await tx.list<AssistantVersion>("assistant_versions")
      ).filter((v) => typeof v.version === "number");
      const latest = versions.sort((a, b) => b.version - a.version)[0];
      if (latest?.id !== session.configId)
        fail(409, "La configuración cambió: abrí una nueva sesión");
      const config = await tx.get<AssistantVersion>(
        "assistant_versions",
        session.configId,
      );
      if (!config || config.mode !== "simulated")
        fail(409, "Simulación desactivada");
      const owner = await tx.get("memberships", config.ownerMembershipId);
      if (!owner?.active) fail(409, "Falta responsable válido");
      let conversation = session.conversationId
        ? await tx.get<Conversation>("conversations", session.conversationId)
        : null;
      if (!conversation) {
        const inquiry: Inquiry = {
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          status: "new",
          ownerMembershipId: config.ownerMembershipId,
          nextAction: "Revisar consulta",
          nextActionAt: new Date(now.getTime() + 3600000).toISOString(),
          interest: input.text.slice(0, 140),
        };
        await tx.save("inquiries", inquiry);
        conversation = {
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          inquiryId: inquiry.id,
          paused: false,
          revision: 0,
        };
        await tx.save("conversations", conversation);
      }
      await tx.lock("conversation:" + conversation.id);
      const q = await tx.get<Inquiry>("inquiries", conversation.inquiryId);
      if (q?.status === "closed")
        await tx.save("inquiries", {
          ...q,
          status: "active",
          nextAction: "Revisar nueva consulta",
          nextActionAt: new Date(now.getTime() + 3600000).toISOString(),
        });
      conversation = (await tx.get<Conversation>(
        "conversations",
        conversation.id,
      ))!;
      if (requestsHuman(input.text))
        conversation = await pauseInTx(
          tx,
          conversation,
          "Pedido del visitante",
          now.toISOString(),
        );
      const message = {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        conversationId: conversation.id,
        configId: config.id,
        clientMessageId: input.clientMessageId,
        text: input.text,
        direction: "incoming",
        mode: "simulated",
        at: now.toISOString(),
      };
      await tx.save("messages", message);
      const job: Job = {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        conversationId: conversation.id,
        configId: config.id,
        conversationRevision: conversation.revision,
        logicalKey: message.id,
        status: conversation.paused || tenantPaused ? "discarded" : "pending",
        attempts: 0,
        runAt: now.toISOString(),
        firstAttemptAt: now.toISOString(),
        text: input.text,
      };
      await tx.save("jobs", job);
      await tx.save("outbox", {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        conversationId: conversation.id,
        configId: config.id,
        jobId: job.id,
        logicalKey: message.id,
        status: conversation.paused || tenantPaused ? "discarded" : "pending",
      });
      await tx.save("public_sessions", {
        ...session,
        conversationId: conversation.id,
        messageCount: session.messageCount + 1,
        messageTimes: [...session.messageTimes, now.getTime()],
      });
      return {
        messageId: message.id,
        inquiryId: conversation.inquiryId,
        conversationId: conversation.id,
        mode: "simulated",
        paused: conversation.paused || tenantPaused,
      };
    });
  }
}
