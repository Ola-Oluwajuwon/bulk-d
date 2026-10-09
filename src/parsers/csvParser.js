const Papa = require('papaparse');
const { Readable } = require('stream');
const { ParsingError } = require('../errors');
const { extractHeaders } = require('./headerExtractor');

/**
 * Parses a CSV buffer, string, or readable stream into structured JSON rows and headers.
 *
 * @param {Buffer | string | Readable} input - Raw CSV data or stream.
 * @param {object} [options]
 * @param {string} [options.encoding='utf-8'] - Character encoding when input is Buffer.
 * @param {boolean} [options.skipEmptyLines=true] - Whether to ignore empty lines.
 * @param {string} [options.delimiter] - Explicit delimiter (auto-detected by default).
 * @returns {Promise<{ rows: Array<Record<string, any>>, headers: string[], rawCount: number }>}
 */
async function parseCsv(input, options = {}) {
  const {
    encoding = 'utf-8',
    skipEmptyLines = true,
    delimiter,
  } = options;

  let stream;

  if (typeof input === 'string') {
    stream = Readable.from([input]);
  } else if (Buffer.isBuffer(input)) {
    // Strip UTF-8 BOM if present
    let content = input.toString(encoding);
    if (content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1);
    }
    stream = Readable.from([content]);
  } else if (input && typeof input.pipe === 'function') {
    stream = input;
  } else {
    throw new ParsingError('CSV parser input must be a Buffer, string, or Readable stream.', {
      receivedType: typeof input,
    });
  }

  return new Promise((resolve, reject) => {
    const rows = [];
    let detectedHeaders = [];
    const parseErrors = [];

    Papa.parse(stream, {
      header: true,
      skipEmptyLines,
      delimiter: delimiter || undefined,
      transformHeader: (header) => (typeof header === 'string' ? header.trim() : header),
      step: (results) => {
        if (results.meta && results.meta.fields && detectedHeaders.length === 0) {
          detectedHeaders = results.meta.fields.filter(
            (f) => typeof f === 'string' && f.trim().length > 0
          );
        }

        if (results.data && typeof results.data === 'object') {
          // Check if row has any non-empty value
          const hasContent = Object.values(results.data).some(
            (v) => v !== undefined && v !== null && String(v).trim().length > 0
          );
          if (hasContent) {
            rows.push(results.data);
          }
        }

        if (results.errors && results.errors.length > 0) {
          parseErrors.push(...results.errors);
        }
      },
      complete: () => {
        const finalHeaders = extractHeaders(rows, detectedHeaders);

        if (rows.length === 0 && parseErrors.length > 0) {
          return reject(
            new ParsingError(`Failed to parse CSV: ${parseErrors[0].message}`, {
              parseErrors,
            })
          );
        }

        resolve({
          rows,
          headers: finalHeaders,
          rawCount: rows.length,
        });
      },
      error: (err) => {
        reject(
          new ParsingError(`Failed to parse CSV stream: ${err.message}`, {
            originalError: err,
          })
        );
      },
    });
  });
}

module.exports = {
  parseCsv,
};
