const { ParsingError } = require('../errors');
const { parseCsv } = require('./csvParser');
const { parseExcel } = require('./excelParser');
const { extractHeaders, extractSampleValues } = require('./headerExtractor');

/**
 * Common MIME types for spreadsheet files.
 */
const CSV_MIMETYPES = new Set([
  'text/csv',
  'application/csv',
  'text/comma-separated-values',
  'application/vnd.ms-excel', // sometimes sent by legacy browsers for CSV
  'text/plain',
]);

const EXCEL_MIMETYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/msexcel',
  'application/x-msexcel',
  'application/x-ms-excel',
  'application/x-excel',
  'application/x-dos_ms_excel',
  'application/xls',
  'application/x-xls',
]);

/**
 * Detects format based on buffer magic bytes, mimetype, or filename.
 *
 * @param {Buffer | null} buffer
 * @param {string} [mimetype]
 * @param {string} [filename]
 * @returns {'csv' | 'excel' | 'unknown'}
 */
function detectFormat(buffer, mimetype, filename) {
  const cleanMime = (mimetype || '').toLowerCase().trim();
  const cleanName = (filename || '').toLowerCase().trim();

  if (cleanName.endsWith('.xlsx') || cleanName.endsWith('.xls')) {
    return 'excel';
  }
  if (cleanName.endsWith('.csv')) {
    return 'csv';
  }

  if (cleanMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return 'excel';
  }

  // Check magic bytes for buffer
  if (buffer && Buffer.isBuffer(buffer) && buffer.length >= 4) {
    // ZIP header (PK\x03\x04) used by .xlsx
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      return 'excel';
    }
    // OLE Compound Document header used by legacy .xls
    if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) {
      return 'excel';
    }
  }

  if (cleanMime && CSV_MIMETYPES.has(cleanMime)) {
    return 'csv';
  }

  if (cleanMime && EXCEL_MIMETYPES.has(cleanMime)) {
    return 'excel';
  }

  return 'unknown';
}

/**
 * Main dispatcher to parse tabular files (CSV, XLSX, XLS).
 *
 * @param {object} params
 * @param {Buffer} [params.buffer]
 * @param {import('stream').Readable} [params.stream]
 * @param {string} [params.mimetype]
 * @param {string} [params.filename]
 * @param {object} [params.options]
 * @returns {Promise<{ rows: Array<Record<string, any>>, headers: string[], rawCount: number, format: string, sampleValues: Record<string, any[]> }>}
 */
async function parseTabularData(params) {
  const { buffer, stream, mimetype, filename, options = {} } = params;

  if (!buffer && !stream) {
    throw new ParsingError('Either a file buffer or stream must be provided.');
  }

  const input = buffer || stream;
  let format = detectFormat(buffer || null, mimetype, filename);

  // If still unknown but we have a text-like mimetype, default to CSV
  if (format === 'unknown') {
    if (mimetype && (mimetype.includes('csv') || mimetype.includes('text'))) {
      format = 'csv';
    } else if (mimetype && mimetype.includes('spreadsheet')) {
      format = 'excel';
    } else {
      // Attempt CSV parsing first, if fails throw
      format = 'csv';
    }
  }

  let result;
  if (format === 'excel') {
    result = await parseExcel(input, options);
  } else {
    result = await parseCsv(input, options);
  }

  const sampleValues = extractSampleValues(result.rows, result.headers, 2);

  return {
    ...result,
    format,
    sampleValues,
  };
}

module.exports = {
  detectFormat,
  parseTabularData,
  parseCsv,
  parseExcel,
  extractHeaders,
  extractSampleValues,
};
