import { defineConfig } from "vitest/config";
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { environment: "jsdom", globals: true, include: ["tests/unit/ui/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/unit/ui/setup.ts"], reporters: ["default", "junit"],
    outputFile: { junit: "build/test-results/ui.xml" } },
});
