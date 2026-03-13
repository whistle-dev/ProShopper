export interface RetryOptions {
  attempts?: number;
  initialDelayMs?: number;
  multiplier?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void | Promise<void>;
}

function sleep(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const multiplier = options.multiplier ?? 2;
  let delayMs = options.initialDelayMs ?? 250;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const canRetry = attempt < attempts && (options.shouldRetry?.(error, attempt) ?? true);
      if (!canRetry) {
        throw error;
      }

      await options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
      delayMs *= multiplier;
    }
  }

  throw new Error("Retry loop exhausted unexpectedly.");
}
