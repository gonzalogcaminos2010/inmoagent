import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run db:migrate && npm run dev:api",
      url: "http://127.0.0.1:3001/health",
      reuseExistingServer: false,
      env: {
        DATABASE_URL: "postgres://inmo_app@127.0.0.1:55433/inmoagent",
        MIGRATOR_URL: "postgres://postgres@127.0.0.1:55433/postgres",
        MIGRATION_DATABASE_URL: "postgres://postgres@127.0.0.1:55433/inmoagent",
      },
    },
    {
      command: "npm run dev:web",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
    },
  ],
});
