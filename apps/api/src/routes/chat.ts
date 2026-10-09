import type { FastifyInstance } from "fastify";
import type {
  DbPort,
  AssistantVersion,
  ChatSession,
} from "../../../../packages/domain/src/types.js";
import { Intake } from "../../../../packages/domain/src/conversations/service.js";
import {
  object,
  id,
  messageSchema,
} from "../../../../packages/contracts/src/schemas.js";
import { fail } from "../../../../packages/domain/src/errors.js";
import type { PublicCapabilities } from "../auth/public-capability.js";
export function registerChat(
  app: FastifyInstance,
  db: DbPort,
  intake: Intake,
  capabilities: PublicCapabilities,
) {
  app.post(
    "/chat/sessions",
    { schema: { body: object({ configId: id }, []) } },
    async (req) => {
      const body = req.body as { configId?: string };
      const configId =
        body.configId ??
        (await db.withTenant(
          req.ctx,
          async (tx) =>
            (await tx.list<AssistantVersion>("assistant_versions"))
              .filter((v) => v.mode === "simulated")
              .sort((a, b) => b.version - a.version)[0]?.id,
        ));
      if (!configId)
        fail(
          409,
          "Publicá y probá un asistente simulado antes de abrir el chat",
        );
      const sessionId = await intake.createSession(req.ctx, configId);
      return {
        id: sessionId,
        chatToken: capabilities.create(req.ctx, sessionId),
        mode: "simulated",
      };
    },
  );
  for (const prefix of ["/chat", "/public/chat"]) {
    app.post(
      prefix + "/sessions/:id/messages",
      { schema: { body: messageSchema } },
      (req) =>
        intake.acceptMessage(req.ctx, {
          ...(req.body as { text: string; clientMessageId: string }),
          sessionId: (req.params as { id: string }).id,
        }),
    );
    app.get(prefix + "/sessions/:id", (req) =>
      db.withTenant(req.ctx, async (tx) => {
        const session = await tx.get<ChatSession>(
          "public_sessions",
          (req.params as { id: string }).id,
        );
        if (!session) fail(404, "Sesión de chat no encontrada");
        const conversation = session.conversationId
          ? await tx.get("conversations", session.conversationId)
          : null;
        const tenant = await tx.get("tenants", req.ctx.tenantId);
        return {
          id: session.id,
          conversationId: session.conversationId,
          paused: Boolean(
            conversation?.paused || tenant?.paused || tenant?.suspended,
          ),
          handoffStatus: conversation?.handoffStatus,
          messages: (await tx.list("messages"))
            .filter((m) => m.conversationId === session.conversationId)
            .sort((a, b) => String(a.at).localeCompare(String(b.at)))
            .map((m) => ({
              id: m.id,
              text: m.text,
              direction: m.direction,
              mode: m.mode,
              at: m.at,
              configId: m.configId,
            })),
          mode: "simulated",
        };
      }),
    );
  }
}
