import { test, expect } from "@playwright/test";
import { login, createAssistant } from "./helpers.js";
test("five step wizard saves, tests exact revision and honestly blocks real activation", async ({
  page,
}) => {
  await login(page);
  await createAssistant(page);
  await expect(page.getByText("Agente creado: sí")).toBeVisible();
  await expect(page.getByText("Canal real conectado: no")).toBeVisible();
  await expect(
    page.getByText("Agente respondiendo en modo real: no"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Intentar activar IA real" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Proveedor de IA no configurado",
  );
});
