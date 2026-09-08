import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  outputDir: "artifacts/playwright",
  fullyParallel: true,
  use: { viewport: { width: 1440, height: 1000 } },
  projects: ["chromium", "firefox", "webkit"].map((name) => ({
    name,
    use: { browserName: name },
  })),
});
