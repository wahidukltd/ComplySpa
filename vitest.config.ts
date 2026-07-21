import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/integration/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["@testing-library/jest-dom/vitest", "./tests/unit/setup.ts"],
    exclude: ["node_modules", ".next", "dist"],
  },
});
