import { test, expect } from "@playwright/test";
import { login, createAssistant } from "./helpers.js";
test("simulation, handoff, accountable follow-up, closure and reload", async ({
  page,
}) => {
  const interest =
    "Busco alquilar en el centro " + crypto.randomUUID().slice(0, 8);
  await login(page);
  await createAssistant(page);
  await page
    .getByRole("button", { name: "Chat de prueba", exact: true })
    .click();
  await page.getByRole("button", { name: "Nueva sesión de chat" }).click();
  await page.getByLabel("Mensaje").fill(interest);
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.locator(".message.outgoing")).toContainText("Simulación");
  await page.getByLabel("Mensaje").fill("Quiero un humano");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(
    page.getByText("Asistente pausado", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Consultas", exact: true }).click();
  await page.getByRole("button", { name: interest }).click();
  await expect(page.getByLabel("Próximo paso", { exact: true })).toHaveValue(
    "Atender pase humano",
  );
  await page.getByLabel("Estado").selectOption("closed");
  await page
    .getByLabel("Resultado de cierre")
    .fill("Atención coordinada con el equipo");
  await page.getByRole("button", { name: "Guardar seguimiento" }).click();
  await expect(page.getByRole("status")).toContainText("Seguimiento guardado");
  await page.reload();
  await expect(page.getByLabel("Estado")).toHaveValue("closed");
});
test("tenant change clears cached inquiries; HTML stays inert on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await createAssistant(page);
  await page
    .getByRole("button", { name: "Chat de prueba", exact: true })
    .click();
  await page.getByRole("button", { name: "Nueva sesión de chat" }).click();
  await page.getByLabel("Mensaje").fill("<img src=x onerror=alert(1)>");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.locator(".message.incoming")).toContainText("<img");
  expect(await page.locator(".message img").count()).toBe(0);
  await page.getByLabel("Identidad de demo").selectOption("b-admin");
  await expect(page.getByText("Sur Inmuebles", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Consultas", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("<img");
});

test("an old inquiry response in flight cannot populate the next tenant", async ({
  page,
}) => {
  await login(page);
  let release!: () => void, reached!: () => void, done!: () => void;
  const hold = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (reached = r)),
    finished = new Promise<void>((r) => (done = r));
  let calls = 0;
  await page.route("**/api/inquiries", async (route) => {
    if (calls++ === 0) {
      reached();
      await hold;
      try {
        await route.fulfill({
          json: [
            {
              id: "old-flight",
              status: "new",
              ownerMembershipId: "member-a-admin",
              interest: "Datos del cliente anterior",
              nextAction: "Revisar",
              nextActionAt: new Date().toISOString(),
            },
          ],
        });
      } catch {
      } finally {
        done();
      }
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await started;
  await page.getByLabel("Identidad de demo").selectOption("b-admin");
  await expect(page.getByText("Sur Inmuebles", { exact: true })).toBeVisible();
  release();
  await finished;
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => r())),
  );
  await expect(page.locator("main")).not.toContainText(
    "Datos del cliente anterior",
  );
});
