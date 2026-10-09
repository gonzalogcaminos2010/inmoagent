import { test, expect } from "vitest";
import { SimulatedChatwoot } from "../../packages/adapters/src/chatwoot/simulated.js";
const a = {
    tenantId: "tenant-a",
    userId: "a",
    membershipId: "a",
    role: "admin" as const,
  },
  b = { ...a, tenantId: "tenant-b" };
test("simulation keeps account mapping and delivery idempotency distinct per tenant", async () => {
  const port = new SimulatedChatwoot();
  const ca = await port.ensureConversation(a, "one"),
    cb = await port.ensureConversation(b, "one");
  expect(ca.externalId).not.toBe(cb.externalId);
  const x = await port.send(a, "one", "Simulación", "key");
  expect(await port.send(a, "one", "Simulación", "key")).toEqual(x);
  expect(x.status).toBe("confirmed");
  expect(port.mode).toBe("simulated");
  expect((await port.send(b, "one", "Simulación", "key")).externalId).not.toBe(
    x.externalId,
  );
});
test("uncertain delivery reconciles; permanent failure never appears delivered", async () => {
  const port = new SimulatedChatwoot();
  port.setScenario("tenant-a", "uncertain");
  expect((await port.send(a, "one", "Simulación", "timeout")).status).toBe(
    "uncertain",
  );
  expect((await port.reconcile(a, "timeout")).status).toBe("confirmed");
  port.setScenario("tenant-a", "permanent");
  expect(await port.send(a, "one", "Simulación", "failure")).toMatchObject({
    status: "failed",
    retryable: false,
  });
  expect(() => port.parseEvent({ accountId: "wrong" })).toThrow();
});
