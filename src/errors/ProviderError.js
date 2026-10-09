const BulkDError = require('./BulkDError');

/**
 * Thrown when an AI provider returns an error, times out, or hits rate limits.
 */
class ProviderError extends BulkDError {
  /**
   * @param {string} message - Human-readable provider error description.
   * @param {Record<string, any>} [details={}] - Contextual details (e.g., provider, statusCode, attempt).
   */
  constructor(message, details = {}) {
    super(message, 'PROVIDER_ERROR', details);
  }
}

module.exports = ProviderError;
