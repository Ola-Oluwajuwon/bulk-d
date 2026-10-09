const BulkDError = require('./BulkDError');

/**
 * Thrown when file parsing fails (e.g. malformed CSV, corrupt Excel, unsupported mimetype).
 */
class ParsingError extends BulkDError {
  /**
   * @param {string} message - Human-readable parsing error description.
   * @param {Record<string, any>} [details={}] - Contextual details (e.g., mimetype, row number, raw error).
   */
  constructor(message, details = {}) {
    super(message, 'PARSING_ERROR', details);
  }
}

module.exports = ParsingError;
