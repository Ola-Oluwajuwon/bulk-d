/**
 * Utilities for extracting, cleaning, and analyzing column headers from parsed tabular datasets.
 */

/**
 * Extracts and cleans unique header names from a parsed dataset.
 *
 * @param {Array<Record<string, any>>} rows - Array of parsed row objects.
 * @param {Array<string>} [explicitHeaders=[]] - Pre-extracted headers from parser if available.
 * @returns {string[]} Array of non-empty, unique header names.
 */
function extractHeaders(rows = [], explicitHeaders = []) {
  const headerSet = new Set();

  // First priority: explicit headers from parser
  if (Array.isArray(explicitHeaders)) {
    for (const h of explicitHeaders) {
      if (typeof h === 'string' && h.trim().length > 0) {
        headerSet.add(h.trim());
      }
    }
  }

  // Second priority: inspect top rows if explicit headers were empty
  if (headerSet.size === 0 && Array.isArray(rows)) {
    const sampleSize = Math.min(rows.length, 50);
    for (let i = 0; i < sampleSize; i++) {
      const row = rows[i];
      if (row && typeof row === 'object') {
        for (const key of Object.keys(row)) {
          if (typeof key === 'string' && key.trim().length > 0) {
            headerSet.add(key.trim());
          }
        }
      }
    }
  }

  return Array.from(headerSet);
}

/**
 * Extracts a lightweight, privacy-conscious sample of row values for each header.
 * This helps LLMs correctly disambiguate cryptic column names (e.g. "C_ADDR" vs "S_ADDR")
 * without sending whole datasets.
 *
 * @param {Array<Record<string, any>>} rows - Array of parsed row objects.
 * @param {string[]} headers - List of extracted headers.
 * @param {number} [maxSamples=2] - Max sample values per header.
 * @returns {Record<string, any[]>} Map of header -> sample values.
 */
function extractSampleValues(rows = [], headers = [], maxSamples = 2) {
  const samples = {};
  for (const header of headers) {
    samples[header] = [];
  }

  for (const row of rows) {
    let allFilled = true;
    for (const header of headers) {
      if (samples[header].length < maxSamples) {
        const val = row[header];
        if (val !== undefined && val !== null && String(val).trim().length > 0) {
          // Truncate long strings to prevent token bloat
          const formatted = typeof val === 'string' && val.length > 50 ? `${val.slice(0, 47)}...` : val;
          samples[header].push(formatted);
        }
      }
      if (samples[header].length < maxSamples) {
        allFilled = false;
      }
    }
    if (allFilled) break;
  }

  return samples;
}

module.exports = {
  extractHeaders,
  extractSampleValues,
};
