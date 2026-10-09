const XLSX = require('xlsx');
const { ParsingError } = require('../errors');
const { extractHeaders } = require('./headerExtractor');

/**
 * Collects a Readable stream into a Buffer.
 *
 * @param {import('stream').Readable} stream
 * @returns {Promise<Buffer>}
 */
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('error', (err) => reject(new ParsingError(`Stream read error: ${err.message}`, { originalError: err })));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Validates whether a buffer matches Excel binary magic bytes (XLSX ZIP or XLS OLE).
 *
 * @param {Buffer} buf
 * @returns {boolean}
 */
function isExcelBinary(buf) {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 4) return false;
  // ZIP signature for .xlsx: PK\x03\x04 or PK\x05\x06 or PK\x07\x08
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  // OLE Compound Document signature for legacy .xls: D0 CF 11 E0
  const isOle = buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
  return isZip || isOle;
}

/**
 * Parses an Excel (.xlsx, .xls) buffer or stream into JSON rows and extracted headers.
 *
 * @param {Buffer | import('stream').Readable} input - Excel buffer or stream.
 * @param {object} [options]
 * @param {string} [options.sheetName] - Name of worksheet to parse. Defaults to first worksheet.
 * @param {number} [options.sheetIndex=0] - 0-based index of worksheet if sheetName is omitted.
 * @param {boolean} [options.cellDates=true] - Whether to parse dates into Date objects.
 * @returns {Promise<{ rows: Array<Record<string, any>>, headers: string[], rawCount: number, sheetName: string }>}
 */
async function parseExcel(input, options = {}) {
  const {
    sheetName: targetSheetName,
    sheetIndex = 0,
    cellDates = true,
  } = options;

  let buffer;

  if (Buffer.isBuffer(input)) {
    buffer = input;
  } else if (input && typeof input.pipe === 'function') {
    buffer = await streamToBuffer(input);
  } else {
    throw new ParsingError('Excel parser input must be a Buffer or Readable stream.', {
      receivedType: typeof input,
    });
  }

  if (!isExcelBinary(buffer)) {
    throw new ParsingError('Invalid Excel file format: buffer does not match XLSX or XLS binary headers.');
  }

  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates,
      cellNF: false,
      cellText: false,
    });
  } catch (err) {
    throw new ParsingError(`Failed to parse Excel workbook: ${err.message}`, {
      originalError: err,
    });
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new ParsingError('Excel workbook contains no sheets.');
  }

  const selectedSheetName =
    targetSheetName && workbook.SheetNames.includes(targetSheetName)
      ? targetSheetName
      : workbook.SheetNames[sheetIndex] || workbook.SheetNames[0];

  const worksheet = workbook.Sheets[selectedSheetName];
  if (!worksheet) {
    throw new ParsingError(`Worksheet "${selectedSheetName}" not found in workbook.`);
  }

  // Parse raw sheet rows as objects (raw: true preserves native numbers and dates)
  const rawRows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: true,
    dateNF: 'yyyy-mm-dd',
  });

  // Also read first row as array of headers to preserve empty columns
  const headerMatrix = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  });

  const explicitHeaders = Array.isArray(headerMatrix[0])
    ? headerMatrix[0].map((h) => (typeof h === 'string' ? h.trim() : String(h || '').trim()))
    : [];

  // Filter out completely empty rows
  const rows = rawRows.filter((row) =>
    Object.values(row).some((val) => val !== undefined && val !== null && String(val).trim().length > 0)
  );

  const finalHeaders = extractHeaders(rows, explicitHeaders);

  return {
    rows,
    headers: finalHeaders,
    rawCount: rows.length,
    sheetName: selectedSheetName,
  };
}

module.exports = {
  parseExcel,
};
