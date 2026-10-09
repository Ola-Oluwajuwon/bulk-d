/**
 * Environment security checks.
 * Prevents bulk-d from running in client-side / browser environments where AI API keys could be leaked.
 */

function assertServerEnvironment() {
  if (typeof window !== 'undefined' || typeof document !== 'undefined') {
    throw new Error(
      'Security Violation: bulk-d is a server-side utility and must never be executed in a browser environment to prevent API key exposure.'
    );
  }
}

module.exports = {
  assertServerEnvironment,
};
