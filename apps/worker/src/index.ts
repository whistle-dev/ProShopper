import { getWorkerEnv } from "./env.js";
import { createWorkerRuntime } from "./runtime.js";

async function main() {
  const env = getWorkerEnv();
  const runtime = await createWorkerRuntime(env);

  console.log("Proshopper worker started.");

  const shutdown = async () => {
    console.log("Shutting down worker...");
    await runtime.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
