import { z } from "zod";

export const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DB_HOST: z.string().min(1).default("localhost"),
  DB_PASSWORD_FILE: z.string().min(1),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);
  if (result.success) return result.data;

  const problems = result.error.issues.map(
    (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
  );
  throw new Error(`Invalid environment variables:\n${problems.join("\n")}`);
}
