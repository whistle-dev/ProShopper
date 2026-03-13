import { describe, expect, it } from "vitest";
import { withRetry } from "../src/index.js";

describe("withRetry", () => {
  it("retries transient failures and eventually succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("temporary");
        }
        return "ok";
      },
      { attempts: 4, initialDelayMs: 0 },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("stops retrying when predicate blocks it", async () => {
    await expect(
      withRetry(
        async () => {
          throw new Error("fatal");
        },
        {
          attempts: 4,
          initialDelayMs: 0,
          shouldRetry: () => false,
        },
      ),
    ).rejects.toThrow("fatal");
  });
});
