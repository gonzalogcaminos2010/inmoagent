import type { FastifyInstance } from "fastify";
import type {
  DbPort,
  AssistantDraft,
} from "../../../../packages/domain/src/types.js";
import { Wizard } from "../../../../packages/domain/src/assistant/wizard.js";
import {
  draftSchema,
  object,
  id,
  text,
} from "../../../../packages/contracts/src/schemas.js";
import { fail } from "../../../../packages/domain/src/errors.js";
export function registerAssistant(
  app: FastifyInstance,
  db: DbPort,
  wizard: Wizard,
) {
  app.get("/assistant/drafts", (req) =>
    db.withTenant(req.ctx, (tx) => tx.list("assistant_drafts")),
  );
  app.post(
    "/assistant/drafts",
    { schema: { body: draftSchema } },
    async (req) => ({
      id: await wizard.saveDraft(req.ctx, req.body as AssistantDraft),
    }),
  );
  app.get("/assistant/drafts/:id", async (req) =>
    db.withTenant(req.ctx, async (tx) => {
      const d = await tx.get(
        "assistant_drafts",
        (req.params as { id: string }).id,
      );
      if (!d) fail(404, "Borrador no encontrado");
      return d;
    }),
  );
  app.put(
    "/assistant/drafts/:id",
    { schema: { body: draftSchema } },
    async (req) => ({
      id: await wizard.saveDraft(
        req.ctx,
        req.body as AssistantDraft,
        (req.params as { id: string }).id,
      ),
    }),
  );
  app.post(
    "/assistant/drafts/:id/test",
    { schema: { body: object({ prompt: text() }) } },
    (req) =>
      wizard.testDraft(
        req.ctx,
        (req.params as { id: string }).id,
        (req.body as { prompt: string }).prompt,
      ),
  );
  app.post(
    "/assistant/drafts/:id/publish",
    { schema: { body: object({ testId: id, idempotencyKey: id }) } },
    (req) => {
      const b = req.body as { testId: string; idempotencyKey: string };
      return wizard.publish(
        req.ctx,
        (req.params as { id: string }).id,
        b.testId,
        b.idempotencyKey,
      );
    },
  );
  app.get("/assistant/:id/readiness", (req) =>
    wizard.getReadiness(req.ctx, (req.params as { id: string }).id),
  );
  app.get("/assistant/versions", (req) =>
    db.withTenant(req.ctx, (tx) => tx.list("assistant_versions")),
  );
}
