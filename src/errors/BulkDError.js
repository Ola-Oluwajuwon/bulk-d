/**
 * Base error class for all bulk-d errors.
 * Allows consumers to catch any error originating from bulk-d using `instanceof BulkDError`.
 */
class BulkDError extends Error {
  /**
   * @param {string} message - Human-readable error message.
   * @param {string} [code='BULK_D_ERROR'] - Machine-readable error code.
   * @param {Record<string, any>} [details={}] - Additional context or metadata.
   */
  constructor(message, code = 'BULK_D_ERROR', details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

module.exports = BulkDError;
