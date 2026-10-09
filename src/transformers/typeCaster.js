/**
 * Safe type coercion for transformed row fields.
 */

/**
 * Casts a raw cell value to the requested target type.
 *
 * @param {any} value - Raw value from spreadsheet cell.
 * @param {'string' | 'number' | 'date' | 'boolean' | 'any'} targetType - Expected type.
 * @returns {any} Casted value or original if unable to cast.
 */
function castValue(value, targetType = 'string') {
  if (value === undefined || value === null) {
    return null;
  }

  const str = typeof value === 'string' ? value.trim() : String(value).trim();
  if (str === '') {
    return null;
  }

  switch (targetType.toLowerCase()) {
    case 'string':
      return str;

    case 'number': {
      if (typeof value === 'number' && !Number.isNaN(value)) {
        return value;
      }
      // Strip currency symbols ($ € £ ¥), percentage, and commas
      const cleaned = str.replace(/[$,€£¥%]/g, '').replace(/,/g, '').trim();
      const num = Number(cleaned);
      if (!Number.isNaN(num) && cleaned.length > 0) {
        return num;
      }
      // Return original value so schema validator reports appropriate error
      return value;
    }

    case 'boolean': {
      if (typeof value === 'boolean') {
        return value;
      }
      const lower = str.toLowerCase();
      if (['true', 'yes', 'y', '1', 't'].includes(lower)) {
        return true;
      }
      if (['false', 'no', 'n', '0', 'f'].includes(lower)) {
        return false;
      }
      return value;
    }

    case 'date': {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
      }
      // If numeric timestamp
      if (typeof value === 'number') {
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) return d;
      }
      const parsedDate = new Date(str);
      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
      return value;
    }

    case 'any':
    default:
      return value;
  }
}

module.exports = {
  castValue,
};
