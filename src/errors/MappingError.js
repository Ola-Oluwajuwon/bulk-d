const BulkDError = require('./BulkDError');

/**
 * Thrown when AI column mapping fails or cannot satisfy schema requirements.
 */
class MappingError extends BulkDError {
  /**
   * @param {string} message - Human-readable mapping error description.
   * @param {Record<string, any>} [details={}] - Contextual details (e.g., missingFields, rawResponse).
   */
  constructor(message, details = {}) {
    super(message, 'MAPPING_ERROR', details);
  }
}

module.exports = MappingError;
