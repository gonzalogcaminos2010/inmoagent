import type {
  DbPort,
  TenantContext,
  Job,
  Conversation,
  AssistantVersion,
  Delivery,
  Sender,
  Clock,
} from "../types.js";
import { fail } from "../errors.js";
import { scheduleRetry, setOutbox, withinRetryWindow } from "./retry.js";
import { pauseInTx } from "../conversations/pause.js";
import { simulate } from "../assistant/simulation.js";
const blocked: Delivery = { status: "failed", retryable: false };
export class Dispatcher {
  constructor(
    private db: DbPort,
    private sender: Sender,
    private clock: Clock = { now: () => new Date() },
    private generate: (
      config: AssistantVersion,
      text: string,
    ) => Promise<string> = async (c, t) => simulate(c, t),
  ) {}
  async dispatchJob(ctx: TenantContext, id: string): Promise<Delivery> {
    const job = await this.db.withTenant(ctx, async (tx) => {
      const observed = await tx.get<Job>("jobs", id);
      if (!observed) fail(404, "Tarea no encontrada");
      await tx.lock("send-gate", true);
      await tx.lock("conversation:" + observed.conversationId);
      await tx.lock("capacity");
      const j = await tx.get<Job>("jobs", id, true);
      if (!j) fail(404, "Tarea no encontrada");
      if (
        j.status !== "pending" ||
        Date.parse(j.runAt) > this.clock.now().getTime()
      )
        return null;
      if (j.attempts > 0 && !withinRetryWindow(j, this.clock.now())) {
        await tx.save("jobs", {
          ...j,
          status: "review",
          error: "Ventana de reintentos agotada",
        });
        await setOutbox(tx, j.id, "review");
        const c = await tx.get<Conversation>("conversations", j.conversationId);
        if (c)
          await pauseInTx(
            tx,
            c,
            "Ventana de reintentos agotada",
            this.clock.now().toISOString(),
          );
        return null;
      }
      const active = (await tx.list<Job>("jobs")).filter(
        (j) =>
          j.status === "claimed" &&
          Date.parse(j.leaseUntil ?? "") > this.clock.now().getTime(),
      ).length;
      if (active >= 2) return null;
      const claimed: Job = {
        ...j,
        status: "claimed",
        attempts: j.attempts + 1,
        leaseUntil: new Date(this.clock.now().getTime() + 60000).toISOString(),
      };
      await tx.save("jobs", claimed);
      return claimed;
    });
    if (!job) return blocked;
    const config = await this.db.withTenant(ctx, (tx) =>
      tx.get<AssistantVersion>("assistant_versions", job.configId),
    );
    if (!config) return blocked;
    const text = await this.generate(config, job.text);
    return this.db.withTenant(ctx, async (tx) => {
      await tx.lock("send-gate", true);
      await tx.lock("conversation:" + job.conversationId);
      const current = await tx.get<Job>("jobs", id),
        c = await tx.get<Conversation>("conversations", job.conversationId),
        tenant = await tx.get("tenants", ctx.tenantId);
      const versions = (
        await tx.list<AssistantVersion>("assistant_versions")
      ).filter((v) => typeof v.version === "number");
      const latest = versions.sort((a, b) => b.version - a.version)[0];
      if (
        current?.status !== "claimed" ||
        !c ||
        c.paused ||
        tenant?.paused ||
        tenant?.suspended ||
        c.revision !== job.conversationRevision ||
        latest?.id !== job.configId
      ) {
        if (current) {
          await tx.save("jobs", { ...current, status: "discarded" });
          await setOutbox(tx, id, "discarded");
        }
        return blocked;
      }
      let delivery: Delivery;
      try {
        delivery = await this.sender.send(ctx, c.id, text, job.logicalKey);
      } catch {
        delivery = { status: "uncertain", retryable: false };
      }
      const next =
        delivery.status === "failed" && delivery.retryable
          ? scheduleRetry(
              current.attempts,
              new Date(current.firstAttemptAt),
              this.clock.now(),
            )
          : null;
      await tx.save("jobs", {
        ...current,
        status:
          delivery.status === "confirmed"
            ? "confirmed"
            : delivery.status === "uncertain"
              ? "uncertain"
              : next
                ? "pending"
                : "review",
        runAt: next?.toISOString() ?? current.runAt,
        failureKind:
          delivery.status === "failed"
            ? delivery.retryable
              ? "transient"
              : "permanent"
            : delivery.status === "uncertain"
              ? "uncertain"
              : undefined,
        externalId: delivery.externalId,
        error:
          delivery.status === "confirmed"
            ? undefined
            : "Entrega simulada no confirmada",
      });
      await setOutbox(
        tx,
        id,
        delivery.status === "confirmed"
          ? "confirmed"
          : next
            ? "pending"
            : delivery.status === "uncertain"
              ? "uncertain"
              : "review",
      );
      if (delivery.status === "failed" && !next)
        await pauseInTx(
          tx,
          c,
          "Fallo de entrega simulada",
          this.clock.now().toISOString(),
        );
      if (delivery.status === "confirmed")
        await tx.save("messages", {
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          conversationId: c.id,
          configId: config.id,
          text,
          direction: "outgoing",
          mode: "simulated",
          externalId: delivery.externalId,
          at: this.clock.now().toISOString(),
        });
      return delivery;
    });
  }
}
