import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3001",
    viewport: { width: 1440, height: 1000 },
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node tests/backend-server.cjs",
      url: "http://127.0.0.1:3000/api/health",
      timeout: 120000,
      reuseExistingServer: false,
    },
    {
      command: "npm run start",
      url: "http://localhost:3001",
      timeout: 120000,
      reuseExistingServer: false,
    },
  ],
});
