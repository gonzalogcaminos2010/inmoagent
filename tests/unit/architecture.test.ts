import { test, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { buildApp } from "../../apps/api/src/app.js";
test("health is explicit simulation without private configuration", async () => {
  const app = buildApp({
    demoMode: true,
    allowedOrigin: "http://127.0.0.1:5173",
  } as any);
  const r = await app.inject("/health");
  expect(r.statusCode).toBe(200);
  expect(r.json()).toEqual({ status: "ok", mode: "simulated" });
  await app.close();
});
test("domain and browser dependencies stay inside their boundaries", () => {
  for (const [base, forbidden] of [
    [
      "packages/domain/src",
      /from ['"].*(fastify|react|pg|packages\/db|adapters)/,
    ],
    ["apps/web/src", /from ['"].*(adapters|packages\/db|\/domain\/)/],
  ] as const) {
    expect(existsSync(base)).toBe(true);
    for (const entry of readdirSync(base, { recursive: true }))
      if (String(entry).endsWith(".ts") || String(entry).endsWith(".tsx"))
        expect(readFileSync(`${base}/${entry}`, "utf8")).not.toMatch(forbidden);
  }
});
