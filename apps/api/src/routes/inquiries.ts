import type { FastifyInstance } from "fastify";
import type { DbPort, Inquiry } from "../../../../packages/domain/src/types.js";
import { Inquiries } from "../../../../packages/domain/src/inquiries/service.js";
import { inquiryPatch } from "../../../../packages/contracts/src/schemas.js";
export function registerInquiries(
  app: FastifyInstance,
  db: DbPort,
  service: Inquiries,
) {
  app.get("/inquiries", (req) => service.list(req.ctx));
  app.get("/inquiries/export", (req) => service.list(req.ctx));
  app.get("/inquiries/:id", async (req) => {
    const q = await service.get(req.ctx, (req.params as { id: string }).id);
    return db.withTenant(req.ctx, async (tx) => {
      const conversations = (await tx.list("conversations")).filter(
        (c) => c.inquiryId === q.id,
      );
      const ids = conversations.map((c) => c.id);
      return {
        ...q,
        conversations,
        messages: (await tx.list("messages")).filter((m) =>
          ids.includes(String(m.conversationId)),
        ),
      };
    });
  });
  app.patch("/inquiries/:id", { schema: { body: inquiryPatch } }, (req) =>
    service.updateInquiry(
      req.ctx,
      (req.params as { id: string }).id,
      req.body as Inquiry,
    ),
  );
  app.get("/memberships", (req) =>
    db.withTenant(req.ctx, async (tx) =>
      (await tx.list("memberships"))
        .filter((m) => m.active)
        .map((m) => ({ id: m.id, role: m.role, userId: m.userId })),
    ),
  );
}
