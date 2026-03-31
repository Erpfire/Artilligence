import { defineConfig } from "@playwright/test";

const DOCKER_PORT = process.env.DOCKER_APP_PORT || "3007";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "docker-deploy.spec.ts",
  timeout: 60000,
  retries: 1,
  workers: 1,
  use: {
    baseURL: `http://localhost:${DOCKER_PORT}`,
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
        },
      },
    },
  ],
});
