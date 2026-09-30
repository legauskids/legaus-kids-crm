import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // whatsapp-service tem os próprios testes (node --test) — não roda aqui.
    exclude: [...configDefaults.exclude, "whatsapp-service/**"],
  },
});
