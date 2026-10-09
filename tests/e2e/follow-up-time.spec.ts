import { test, expect } from "@playwright/test";
import { login, createAssistant } from "./helpers.js";
for (const timezoneId of ["UTC", "America/Argentina/Catamarca"]) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    test("follow-up stores Catamarca time and survives reload across midnight", async ({
      page,
    }) => {
      await login(page);
      await createAssistant(page);
      await page
        .getByRole("button", { name: "Chat de prueba", exact: true })
        .click();
      await page.getByRole("button", { name: "Nueva sesión de chat" }).click();
      const interest = "Horario Catamarca " + crypto.randomUUID();
      await page.getByLabel("Mensaje").fill(interest);
      await page.getByRole("button", { name: "Enviar mensaje" }).click();
      await expect(page.locator(".message.outgoing")).toContainText(
        "Simulación",
      );
      await page
        .getByRole("button", { name: "Consultas", exact: true })
        .click();
      await page.getByRole("button", { name: interest }).click();
      const field = page.getByLabel(
        "Fecha del próximo paso · Catamarca (UTC−3)",
      );
      await field.fill("2026-12-31T23:30");
      const saved = page.waitForResponse(
        (r) =>
          r.request().method() === "PATCH" && r.url().includes("/inquiries/"),
      );
      await page.getByRole("button", { name: "Guardar seguimiento" }).click();
      const response = await saved;
      expect(response.request().postDataJSON().nextActionAt).toBe(
        "2027-01-01T02:30:00.000Z",
      );
      await expect(page.getByRole("status")).toContainText(
        "Seguimiento guardado",
      );
      await page.reload();
      await expect(field).toHaveValue("2026-12-31T23:30");
      await page
        .getByRole("button", { name: "Consultas", exact: true })
        .click();
      await expect(
        page
          .getByRole("row")
          .filter({ has: page.getByRole("button", { name: interest }) }),
      ).toContainText("31/12/2026, 23:30");
    });
  });
}
