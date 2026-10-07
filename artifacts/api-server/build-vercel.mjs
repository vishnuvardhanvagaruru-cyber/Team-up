import { build } from "esbuild";
import { fileURLToPath } from "node:url";

await build({
  entryPoints: [
    fileURLToPath(new URL("./src/app.ts", import.meta.url))
  ],
  outfile: fileURLToPath(
    new URL("./dist/vercel.cjs", import.meta.url)
  ),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["pino", "pino-http"],
  define: {
    "process.env.NODE_ENV": '"production"'
  },
  logLevel: "info"
});