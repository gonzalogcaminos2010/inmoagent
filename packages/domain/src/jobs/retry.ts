import type {
  DbPort,
  TenantContext,
  Job,
  Random,
  Clock,
  Conversation,
  AssistantVersion,
  Delivery,
  Tx,
} from "../types.js";
import type { Dispatcher } from "./dispatcher.js";
import { simulate } from "../assistant/simulation.js";
import { pauseInTx } from "../conversations/pause.js";
export function withinRetryWindow(job: Job, now = new Date()) {
  return (
    job.attempts < 5 && now.getTime() - Date.parse(job.firstAttemptAt) < 1800000
  );
}
export async function canRetry(tx: Tx, job: Job, now = new Date()) {
  if (
    job.status !== "pending" ||
    job.failureKind !== "transient" ||
    !withinRetryWindow(job, now)
  )
    return false;
  const c = await tx.get<Conversation>("conversations", job.conversationId),
    tenant = await tx.get("tenants", job.tenantId);
  const latest = (await tx.list<AssistantVersion>("assistant_versions")).sort(
    (a, b) => b.version - a.version,
  )[0];
  return (
    !!c &&
    !c.paused &&
    !tenant?.paused &&
    !tenant?.suspended &&
    c.revision === job.conversationRevision &&
    latest?.id === job.configId
  );
}
export function scheduleRetry(
  attempt: number,
  first: Date,
  now: Date,
  random: Random = { jitter: (max) => Math.floor(Math.random() * max) },
) {
  if (attempt >= 5 || now.getTime() - first.getTime() >= 1800000) return null;
  const base = Math.min(60000, 1000 * 2 ** Math.max(0, attempt - 1));
  const next = new Date(
    now.getTime() + base + random.jitter(Math.floor(base * 0.2)),
  );
  return next.getTime() - first.getTime() > 1800000 ? null : next;
}
export async function setOutbox(tx: Tx, jobId: string, status: string) {
  for (const o of await tx.list("outbox"))
    if (o.jobId === jobId) await tx.save("outbox", { ...o, status });
}
interface Reconciler {
  reconcile(ctx: TenantContext, key: string): Promise<Delivery>;
}
export class Recovery {
  constructor(
    private db: DbPort,
    private dispatcher: Dispatcher,
    private adapter: Reconciler,
    private contexts: TenantContext[],
    private clock: Clock = { now: () => new Date() },
  ) {}
  async runDueJobs(now = this.clock.now()) {
    let handled = 0;
    for (const ctx of this.contexts) {
      const jobs = await this.db.withTenant(ctx, (tx) => tx.list<Job>("jobs"));
      for (const j of jobs) {
        if (j.status === "pending" && Date.parse(j.runAt) <= now.getTime()) {
          await this.dispatcher.dispatchJob(ctx, j.id);
          handled++;
          continue;
        }
        if (
          j.status !== "uncertain" &&
          !(
            j.status === "claimed" &&
            Date.parse(j.leaseUntil ?? "") <= now.getTime()
          )
        )
          continue;
        await this.db.withTenant(ctx, async (tx) => {
          await tx.lock("send-gate", true);
          await tx.lock("conversation:" + j.conversationId);
          const current = await tx.get<Job>("jobs", j.id, true);
          if (!current || !["claimed", "uncertain"].includes(current.status))
            return;
          let delivery: Delivery;
          try {
            delivery = await this.adapter.reconcile(ctx, j.logicalKey);
          } catch {
            delivery = { status: "uncertain", retryable: false };
          }
          const c = await tx.get<Conversation>(
            "conversations",
            j.conversationId,
          );
          if (delivery.status === "confirmed") {
            await tx.save("jobs", {
              ...current,
              status: "confirmed",
              externalId: delivery.externalId,
              error: undefined,
            });
            await setOutbox(tx, j.id, "confirmed");
            const previous = (await tx.list("messages")).find(
              (m) =>
                m.direction === "outgoing" &&
                m.externalId === delivery.externalId,
            );
            const config = await tx.get<AssistantVersion>(
              "assistant_versions",
              j.configId,
            );
            if (!previous && config)
              await tx.save("messages", {
                id: crypto.randomUUID(),
                tenantId: ctx.tenantId,
                conversationId: j.conversationId,
                configId: j.configId,
                text: simulate(config, j.text),
                direction: "outgoing",
                mode: "simulated",
                externalId: delivery.externalId,
                at: now.toISOString(),
              });
          } else {
            await tx.save("jobs", {
              ...current,
              status: "review",
              error: "Entrega incierta: requiere revisión humana",
            });
            await setOutbox(tx, j.id, "review");
            if (c)
              await pauseInTx(tx, c, "Entrega incierta", now.toISOString());
          }
        });
        handled++;
      }
    }
    return handled;
  }
}
