// Lints openapi/openapi.yaml with Redocly and passes its exit code through:
// 0 when the spec is valid (warnings are allowed), non-zero when there are errors.
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const spec = join(import.meta.dirname, "..", "openapi", "openapi.yaml");

// shell: true lets npx resolve the local `redocly` binary on Windows (.cmd) and Unix alike.
const result = spawnSync("npx", ["--no-install", "redocly", "lint", `"${spec}"`], {
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
