import { z } from "zod";

const workerEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  DISCORD_WEBHOOK_URL: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined))
    .pipe(z.string().url().optional()),
  SESSION_ENCRYPTION_KEY: z.string().min(32),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  PROSHOP_PICKUP_STORE_NAME: z.string().default("Proshop København"),
  ALLOW_LIVE_ORDER_SUBMIT: z.enum(["true", "false"]).default("false"),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function getWorkerEnv(): WorkerEnv {
  return workerEnvSchema.parse(process.env);
}
