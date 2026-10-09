import type { FastifyInstance, FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import { Sessions, fail, identities } from "./session.js";
import type { PublicCapabilities } from "./public-capability.js";
import type { TenantContext } from "../../../../packages/domain/src/types.js";
declare module "fastify" {
  interface FastifyRequest {
    ctx: TenantContext;
  }
}
export function registerAuth(
  app: FastifyInstance,
  sessions: Sessions,
  origin: string,
  publicCapabilities?: PublicCapabilities,
) {
  app.register(cookie);
  app.addHook("preHandler", async (req) => {
    if (req.url === "/health") return;
    if (req.url.startsWith("/public/chat/sessions/")) {
      if (req.method !== "GET" && req.headers.origin !== origin)
        fail(403, "Origin inválido");
      const match = /^\/public\/chat\/sessions\/([^/?]+)(?:\/messages)?$/.exec(
        req.url,
      );
      if (!match || !publicCapabilities)
        fail(404, "Sesión de chat no encontrada");
      req.ctx = publicCapabilities.resolve(
        req.headers["x-chat-token"],
        match[1]!,
      );
      return;
    }
    const login = req.url === "/demo/session" && req.method === "POST";
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers.origin !== origin) fail(403, "Origin inválido");
      if (!login)
        await sessions.csrf(
          req.cookies.session ?? "",
          req.headers["x-csrf-token"],
        );
    }
    if (!login)
      req.ctx = await sessions.resolveSession(req.cookies.session ?? "");
  });
  app.post(
    "/demo/session",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["identity"],
          properties: {
            identity: { type: "string", enum: Object.keys(identities) },
          },
        },
      },
    },
    async (req, reply) => {
      if (req.cookies.session) {
        try {
          await sessions.csrf(req.cookies.session, req.headers["x-csrf-token"]);
        } catch (error) {
          if ((error as { statusCode?: number }).statusCode !== 401)
            throw error;
        }
        await sessions.revokeSession(req.cookies.session);
      }
      const s = await sessions.createDemoSession(
        (req.body as { identity: keyof typeof identities }).identity,
      );
      reply.setCookie("session", s.sessionId, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        secure: origin.startsWith("https:"),
        maxAge: 7200,
      });
      return {
        ctx: await sessions.resolveSession(s.sessionId),
        csrfToken: s.csrfToken,
        mode: "simulated",
      };
    },
  );
  app.get("/session", async (req) => ({
    ctx: req.ctx,
    csrfToken: sessions.token(req.cookies.session!),
    mode: "simulated",
  }));
  app.delete("/session", async (req, reply) => {
    await sessions.revokeSession(req.cookies.session!);
    reply.clearCookie("session", { path: "/" }).code(204);
  });
  app.post("/assistant/check-permission", async (req) => {
    requireAdmin(req);
    return { allowed: true };
  });
}
export function requireAdmin(req: FastifyRequest) {
  if (req.ctx.role !== "admin") fail(403, "Se requiere administrador");
}
