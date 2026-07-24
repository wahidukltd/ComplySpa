import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "supabase/functions/**",
    "clerk-cli/**",
    "src/types/database.ts",
  ]),
  ...nextVitals,
  ...nextTs,
]);

export default eslintConfig;
