// Compares .env.example with the env schema and exits with 1 when they disagree:
//  - a schema variable is missing from the file (the file is stale),
//  - the file has a variable the schema does not know (leftover),
//  - a variable has no comment line right above it.
// The schema is TypeScript, so this script reads the compiled copy in dist/ (npm run check:env builds first).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EnvSchema } from "../dist/config/env.schema.js";

const file = join(import.meta.dirname, "..", ".env.example");
const lines = readFileSync(file, "utf8").split(/\r?\n/);

const documented = new Map(); // variable -> has a comment right above it
lines.forEach((line, i) => {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
  if (match) documented.set(match[1], lines[i - 1]?.trimStart().startsWith("#") ?? false);
});

const schemaKeys = Object.keys(EnvSchema.shape);
const problems = [
  ...schemaKeys
    .filter((key) => !documented.has(key))
    .map((key) => `${key} is in the schema but missing from .env.example`),
  ...[...documented.keys()]
    .filter((key) => !schemaKeys.includes(key))
    .map((key) => `${key} is in .env.example but not in the schema`),
  ...[...documented]
    .filter(([, hasComment]) => !hasComment)
    .map(([key]) => `${key} has no comment line above it in .env.example`),
];

if (problems.length > 0) {
  console.error(".env.example is out of sync with the schema:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`.env.example matches the schema (${schemaKeys.length} variables).`);
