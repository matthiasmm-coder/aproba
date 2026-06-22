import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` lanza una excepción fuera de un Server Component; en los tests
      // lo mapeamos a su versión vacía (no-op) para poder importar lib/ex-forms.ts.
      "server-only": path.resolve("node_modules/server-only/empty.js"),
      "@": path.resolve("."),
    },
  },
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
});
