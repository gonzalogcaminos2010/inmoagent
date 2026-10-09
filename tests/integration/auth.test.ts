import { test, expect } from "vitest";
import { buildApp } from "../../apps/api/src/app.js";
import { Sessions, assertLoopback } from "../../apps/api/src/auth/session.js";
const origin = "http://127.0.0.1:5173";
test("session expires, rotates and revokes without changing old tenant", async () => {
  let now = new Date("2026-10-08T12:00Z");
  const sessions = new Sessions({ now: () => now });
  const first = await sessions.createDemoSession("a-admin");
  expect((await sessions.resolveSession(first.sessionId)).tenantId).toBe(
    "tenant-a",
  );
  await sessions.revokeSession(first.sessionId);
  await expect(sessions.resolveSession(first.sessionId)).rejects.toMatchObject({
    statusCode: 401,
  });
  const second = await sessions.createDemoSession("b-admin");
  now = new Date("2026-10-08T14:01Z");
  await expect(sessions.resolveSession(second.sessionId)).rejects.toMatchObject(
    { statusCode: 401 },
  );
  expect(() => assertLoopback("0.0.0.0")).toThrow();
});
test("API requires scoped cookie, origin, CSRF and admin permission", async () => {
  const app = buildApp({ demoMode: true, allowedOrigin: origin });
  expect((await app.inject("/session")).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/demo/session",
        payload: { identity: "a-admin" },
      })
    ).statusCode,
  ).toBe(403);
  const r = await app.inject({
    method: "POST",
    url: "/demo/session",
    headers: { origin },
    payload: { identity: "a-operator" },
  });
  expect(r.statusCode).toBe(200);
  const cookie = r.cookies[0]!.name + "=" + r.cookies[0]!.value;
  expect(r.headers["set-cookie"]).toContain("HttpOnly");
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/assistant/check-permission",
        headers: { cookie, origin, "x-csrf-token": r.json().csrfToken },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: "/session",
        headers: { cookie, origin },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: "/session",
        headers: { cookie, origin, "x-csrf-token": r.json().csrfToken },
      })
    ).statusCode,
  ).toBe(204);
  expect(
    (await app.inject({ url: "/session", headers: { cookie } })).statusCode,
  ).toBe(401);
  await app.close();
});
test("rotating identity invalidates old cookie and does not accept arbitrary client fields", async () => {
  const app = buildApp({ demoMode: true, allowedOrigin: origin });
  const first = await app.inject({
    method: "POST",
    url: "/demo/session",
    headers: { origin },
    payload: { identity: "a-admin" },
  });
  const cookie = "session=" + first.cookies[0]!.value;
  const second = await app.inject({
    method: "POST",
    url: "/demo/session",
    headers: { origin, cookie, "x-csrf-token": first.json().csrfToken },
    payload: { identity: "b-admin" },
  });
  expect(second.json().ctx.tenantId).toBe("tenant-b");
  expect(
    (await app.inject({ url: "/session", headers: { cookie } })).statusCode,
  ).toBe(401);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/demo/session",
        headers: { origin },
        payload: { identity: "a-admin", tenantId: "tenant-b" },
      })
    ).statusCode,
  ).toBe(400);
  await app.close();
});
