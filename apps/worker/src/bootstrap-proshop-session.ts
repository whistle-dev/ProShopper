import { encryptJson } from "@proshopper/core";
import { chromium } from "playwright";
import { z } from "zod";

const envSchema = z.object({
  PROSHOP_CONNECT_URL: z.string().url(),
  CONNECT_API_TOKEN: z.string().min(1),
  SESSION_ENCRYPTION_KEY: z.string().min(32),
});

async function main() {
  const env = envSchema.parse(process.env);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Opening Proshop login. Complete the login manually, then press Enter here.");
  await page.goto("https://www.proshop-login.dk/Logind?axOIDP_returnUrl=https%3A%2F%2Fwww.proshop.dk%2F", {
    waitUntil: "domcontentloaded",
  });

  process.stdin.resume();
  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  const storageState = await context.storageState();
  const encryptedState = encryptJson(storageState, env.SESSION_ENCRYPTION_KEY);

  const response = await fetch(env.PROSHOP_CONNECT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.CONNECT_API_TOKEN}`,
    },
    body: JSON.stringify({
      label: "Primary Proshop account",
      sessionState: encryptedState,
      sessionMeta: {
        cookies: storageState.cookies.length,
        origins: storageState.origins.length,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to upload session state: ${response.status}`);
  }

  console.log("Uploaded encrypted session state to the dashboard API.");
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
