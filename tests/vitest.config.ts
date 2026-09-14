import { defineConfig } from "vitest/config";
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom", globals: true, include: ["tests/unit/ui/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/unit/ui/setup.ts"], reporters: ["default", "junit"],
    outputFile: { junit: "build/test-results/ui.xml" },
    coverage: {
      provider: "v8", include: ["src/ui/src/**/*.{ts,tsx}"],
      exclude: ["src/ui/src/main.tsx"],
      reporter: ["text", "json", "json-summary", "html", "lcov"],
      reportsDirectory: "build/coverage/ui",
      thresholds: { lines: 93, statements: 83, functions: 79, branches: 77 },
    },
  },
});
