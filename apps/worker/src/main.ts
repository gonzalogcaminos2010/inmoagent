import { Database } from "../../../packages/db/src/tenant-transaction.js";
import { Dispatcher } from "../../../packages/domain/src/jobs/dispatcher.js";
import { Recovery } from "../../../packages/domain/src/jobs/retry.js";
import { SimulatedChatwoot } from "../../../packages/adapters/src/chatwoot/simulated.js";
const db = new Database(),
  adapter = new SimulatedChatwoot(db),
  dispatcher = new Dispatcher(db, adapter);
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
const recovery = new Recovery(db, dispatcher, adapter, contexts);
let running = false;
const tick = setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await recovery.runDueJobs();
  } catch {
    console.error("Error de trabajador; revisar operación local");
  } finally {
    running = false;
  }
}, 1000);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    clearInterval(tick);
    await db.close();
    process.exit();
  });
