/**
 * Exponential backoff retry helper.
 *
 * @template T
 * @param {() => Promise<T>} fn - Asynchronous operation to retry.
 * @param {object} [options]
 * @param {number} [options.maxRetries=3] - Maximum retry attempts.
 * @param {number} [options.initialDelayMs=500] - Initial delay in milliseconds.
 * @param {number} [options.maxDelayMs=5000] - Cap on retry delay.
 * @param {number} [options.factor=2] - Multiplier factor for backoff.
 * @param {(err: any) => boolean} [options.shouldRetry] - Predicate to determine if error is retryable.
 * @returns {Promise<T>}
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelayMs = 500,
    maxDelayMs = 5000,
    factor = 2,
    shouldRetry = () => true,
  } = options;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt > maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Add small jitter to avoid thundering herd
      const jitter = Math.random() * 100;
      const sleepMs = Math.min(delay + jitter, maxDelayMs);

      await new Promise((resolve) => setTimeout(resolve, sleepMs));
      delay *= factor;
    }
  }
}

module.exports = {
  retryWithBackoff,
};
