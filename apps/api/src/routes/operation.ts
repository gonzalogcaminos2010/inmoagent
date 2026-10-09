import { canRetry } from "../../../../packages/domain/src/jobs/retry.js";
import type { FastifyInstance } from "fastify";
import type {
  DbPort,
  Conversation,
  Job,
} from "../../../../packages/domain/src/types.js";
import { Pauses } from "../../../../packages/domain/src/conversations/pause.js";
import { Budget } from "../../../../packages/domain/src/usage/budget.js";
import { object, text } from "../../../../packages/contracts/src/schemas.js";
import { fail } from "../../../../packages/domain/src/errors.js";
import type {
  SimulatedChatwoot,
  Scenario,
} from "../../../../packages/adapters/src/chatwoot/simulated.js";
import { requireAdmin } from "../auth/routes.js";
export function registerOperation(
  app: FastifyInstance,
  db: DbPort,
  pauses: Pauses,
  budget: Budget,
  adapter: SimulatedChatwoot,
) {
  app.get("/operation", async (req) => ({
    mode: "simulated",
    realAi: false,
    realChatwoot: false,
    whatsappConnected: false,
    budget: await budget.report(req.ctx),
    ...(await db.withTenant(req.ctx, async (tx) => ({
      tenant: await tx.get("tenants", req.ctx.tenantId),
      jobs: await Promise.all(
        (await tx.list<Job>("jobs"))
          .filter(
            (j) =>
              j.status === "review" ||
              j.status === "uncertain" ||
              j.status === "pending" ||
              j.status === "claimed",
          )
          .map(async (j) => ({
            canRetry: await canRetry(tx, j),
            id: j.id,
            status: j.status,
            attempts: j.attempts,
            error: j.error,
            conversationId: j.conversationId,
          })),
      ),
      messageCount: (await tx.list("messages")).length,
    }))),
  }));
  app.post(
    "/operation/pause",
    { schema: { body: object({ paused: { type: "boolean" } }) } },
    (req) =>
      pauses.pauseTenant(req.ctx, (req.body as { paused: boolean }).paused),
  );
  app.post(
    "/operation/scenario",
    {
      schema: {
        body: object({
          scenario: {
            type: "string",
            enum: [
              "normal",
              "uncertain",
              "transient",
              "permanent",
              "unreconcilable",
            ],
          },
        }),
      },
    },
    async (req) => {
      requireAdmin(req);
      adapter.setScenario(
        req.ctx.tenantId,
        (req.body as { scenario: Scenario }).scenario,
      );
      return { mode: "simulated" };
    },
  );
  app.post(
    "/conversations/:id/pause",
    { schema: { body: object({ reason: text(500) }) } },
    (req) =>
      pauses.pauseConversation(
        req.ctx,
        (req.params as { id: string }).id,
        (req.body as { reason: string }).reason,
      ),
  );
  app.post(
    "/conversations/:id/resume",
    { schema: { body: object({}) } },
    (req) =>
      pauses.resumeConversation(req.ctx, (req.params as { id: string }).id),
  );
  app.post(
    "/conversations/:id/handoff",
    { schema: { body: object({}) } },
    async (req) => {
      const id = (req.params as { id: string }).id;
      await pauses.pauseConversation(req.ctx, id, "Pase humano simulado");
      let status: "confirmed" | "failed";
      const delivery = await adapter.send(
        req.ctx,
        id,
        "Pase humano simulado",
        "handoff:" + id,
      );
      status = delivery.status === "confirmed" ? "confirmed" : "failed";
      return db.withTenant(req.ctx, async (tx) => {
        await tx.lock("conversation:" + id);
        const c = await tx.get<Conversation>("conversations", id);
        if (!c) fail(404, "Conversación no encontrada");
        const updated = { ...c, handoffStatus: status };
        await tx.save("conversations", updated);
        return { ...updated, mode: "simulated" };
      });
    },
  );
  app.post(
    "/operation/jobs/:id/retry",
    { schema: { body: object({}) } },
    async (req) =>
      db.withTenant(req.ctx, async (tx) => {
        const j = await tx.get<Job>("jobs", (req.params as { id: string }).id);
        if (!j) fail(404, "Tarea no encontrada");
        await tx.lock("send-gate", true);
        await tx.lock("conversation:" + j.conversationId);
        const current = await tx.get<Job>("jobs", j.id, true);
        if (!current || !(await canRetry(tx, current)))
          fail(409, "Tarea no reintentable; revisar atención humana");
        await tx.save("jobs", {
          ...current!,
          status: "pending",
          runAt: new Date().toISOString(),
        });
        return { mode: "simulated", status: "pending" };
      }),
  );
}
