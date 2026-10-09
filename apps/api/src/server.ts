import { buildApp } from "./app.js";
import { assertLoopback } from "./auth/session.js";
import { Database } from "../../../packages/db/src/tenant-transaction.js";
import { SimulatedChatwoot } from "../../../packages/adapters/src/chatwoot/simulated.js";
import { DisabledAiAdapter } from "../../../packages/adapters/src/ai/disabled.js";
import { Dispatcher } from "../../../packages/domain/src/jobs/dispatcher.js";
import { Recovery } from "../../../packages/domain/src/jobs/retry.js";
const host = process.env.HOST ?? "127.0.0.1";
assertLoopback(host);
const db = new Database(),
  chatwoot = new SimulatedChatwoot(db);
const app = buildApp({
  demoMode: true,
  allowedOrigin: process.env.DEMO_ORIGIN ?? "http://127.0.0.1:5173",
  db,
  chatwoot,
  ai: new DisabledAiAdapter(),
});
const contexts = [
  {
    tenantId: "tenant-a",
    userId: "user-a-admin",
    membershipId: "member-a-admin",
    role: "admin" as const,
  },
  {
    tenantId: "tenant-b",
    userId: "user-b-admin",
    membershipId: "member-b-admin",
    role: "admin" as const,
  },
];
const recovery = new Recovery(
  db,
  new Dispatcher(db, chatwoot),
  chatwoot,
  contexts,
);
let running = false;
const timer = setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await recovery.runDueJobs();
  } catch {
    console.error("Trabajador simulado: revisar operación");
  } finally {
    running = false;
  }
}, 500);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    clearInterval(timer);
    await app.close();
    await db.close();
    process.exit();
  });
await app.listen({ host, port: 3001 });
console.log("API local Simulación: http://127.0.0.1:3001");
