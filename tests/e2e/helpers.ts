import { expect, type Page } from "@playwright/test";
export async function login(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar a demo" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Consultas", exact: true }),
  ).toBeVisible();
}
export async function createAssistant(page: Page) {
  await page
    .getByRole("button", { name: "Crear asistente", exact: true })
    .click();
  await page.getByLabel("Nombre del negocio").fill("Río Propiedades");
  await page
    .getByLabel("Conocimiento aprobado")
    .fill(
      "Ejemplo ficticio: coordinamos atención con el equipo; no confirmamos disponibilidad.",
    );
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page
    .getByRole("button", { name: "Probar simulación", exact: true })
    .click();
  await expect(
    page.getByText("Prueba satisfactoria de esta revisión"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    page.getByText("WhatsApp no conectado", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByLabel("Confirmo que el conocimiento ficticio está aprobado")
    .check();
  await page
    .getByRole("button", { name: "Publicar simulación", exact: true })
    .click();
  await expect(
    page.getByText("Simulación publicada", { exact: true }),
  ).toBeVisible();
}
