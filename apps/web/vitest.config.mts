import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const integration = process.env.VITEST_INTEGRATION === "1";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: integration ? ["tests/**/*.int.test.ts"] : ["tests/**/*.test.ts"],
    exclude: integration ? configDefaults.exclude : [...configDefaults.exclude, "tests/**/*.int.test.ts"],
  },
});
