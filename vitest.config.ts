import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  plugins:[react()],
  resolve:{alias:{"@":path.resolve(__dirname,"."),"server-only":path.resolve(__dirname,"tests/server-only-shim.ts")}},
  test:{environment:"node",globals:true},
});
