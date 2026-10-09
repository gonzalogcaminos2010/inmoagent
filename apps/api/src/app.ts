import Fastify from "fastify";
import { registerAuth } from "./auth/routes.js";
import { Sessions } from "./auth/session.js";
import { PublicCapabilities } from "./auth/public-capability.js";
import { registerAssistant } from "./routes/assistant.js";
import { registerInquiries } from "./routes/inquiries.js";
import { registerChat } from "./routes/chat.js";
import { registerOperation } from "./routes/operation.js";
import { Wizard } from "../../../packages/domain/src/assistant/wizard.js";
import { Inquiries } from "../../../packages/domain/src/inquiries/service.js";
import { Intake } from "../../../packages/domain/src/conversations/service.js";
import { Pauses } from "../../../packages/domain/src/conversations/pause.js";
import { Budget } from "../../../packages/domain/src/usage/budget.js";
import type { DbPort } from "../../../packages/domain/src/types.js";
import type { SimulatedChatwoot } from "../../../packages/adapters/src/chatwoot/simulated.js";
import type { AiPort } from "../../../packages/adapters/src/ai/port.js";
import type { Clock } from "../../../packages/domain/src/types.js";
export interface AppDependencies {
  demoMode: boolean;
  allowedOrigin: string;
  clock?: Clock;
  db?: DbPort;
  chatwoot?: SimulatedChatwoot;
  ai?: AiPort;
}
export function buildApp(deps: AppDependencies) {
  const app = Fastify({
    logger: false,
    bodyLimit: 16384,
    ajv: { customOptions: { removeAdditional: false } },
  });
  if (!deps.demoMode)
    throw new Error("La autenticación de piloto no está configurada");
  app.setErrorHandler((error, _req, reply) => {
    const e = error as { statusCode?: number; message: string };
    const status = e.statusCode ?? 500;
    reply
      .code(status)
      .send({ error: status < 500 ? e.message : "Error interno" });
  });
  const capabilities = new PublicCapabilities(deps.clock);
  registerAuth(app, new Sessions(deps.clock), deps.allowedOrigin, capabilities);
  if (deps.db && deps.chatwoot) {
    const db = deps.db;
    registerAssistant(app, db, new Wizard(db, deps.clock));
    registerInquiries(app, db, new Inquiries(db));
    registerChat(app, db, new Intake(db, deps.clock), capabilities);
    registerOperation(
      app,
      db,
      new Pauses(db, deps.clock),
      new Budget(db, deps.clock),
      deps.chatwoot,
    );
  }
  app.get("/health", async () => ({ status: "ok", mode: "simulated" }));
  return app;
}
