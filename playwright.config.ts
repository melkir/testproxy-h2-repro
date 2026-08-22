import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  webServer: {
    command: "npm run build && npm start",
    url: "http://localhost:3000",
    timeout: 60_000,
    reuseExistingServer: false,
  },
  use: {
    baseURL: "http://localhost:3000",
  },
});
