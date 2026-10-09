const BulkDError = require('./BulkDError');

/**
 * Thrown when target schema is invalid or configuration parameters are invalid.
 */
class ValidationError extends BulkDError {
  /**
   * @param {string} message - Human-readable validation error description.
   * @param {Record<string, any>} [details={}] - Contextual validation error details.
   */
  constructor(message, details = {}) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

module.exports = ValidationError;
