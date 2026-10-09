const { castValue } = require('../../src/transformers/typeCaster');
const { transformRows } = require('../../src/transformers/rowTransformer');
const { normalizeTargetSchema } = require('../../src/validation/schemaValidator');

describe('Transformers & Type Casting', () => {
  describe('castValue', () => {
    test('coerces string correctly', () => {
      expect(castValue('  hello world  ', 'string')).toBe('hello world');
      expect(castValue('', 'string')).toBeNull();
      expect(castValue(null, 'string')).toBeNull();
    });

    test('coerces number with currency symbols and commas', () => {
      expect(castValue('$1,234.56', 'number')).toBe(1234.56);
      expect(castValue('€ 500', 'number')).toBe(500);
      expect(castValue('42', 'number')).toBe(42);
      expect(castValue(99, 'number')).toBe(99);
      expect(castValue('invalid', 'number')).toBe('invalid');
    });

    test('coerces boolean values', () => {
      expect(castValue('true', 'boolean')).toBe(true);
      expect(castValue('yes', 'boolean')).toBe(true);
      expect(castValue('1', 'boolean')).toBe(true);
      expect(castValue('false', 'boolean')).toBe(false);
      expect(castValue('no', 'boolean')).toBe(false);
      expect(castValue('0', 'boolean')).toBe(false);
    });

    test('coerces date values', () => {
      const date = castValue('2024-05-15', 'date');
      expect(date).toBeInstanceOf(Date);
      expect(date.getUTCFullYear()).toBe(2024);
    });
  });

  describe('transformRows', () => {
    const schema = normalizeTargetSchema({
      firstName: { type: 'string', required: true },
      salary: { type: 'number', required: false },
      isActive: { type: 'boolean', required: false },
    });

    test('applies mapping, casts types, and filters unmapped columns', () => {
      const rows = [
        { 'F_NAME': ' Alice ', 'ANNUAL_PAY': '$85,000', 'ACTIVE_FLAG': 'yes', 'UNWANTED_COL': 'garbage' },
        { 'F_NAME': ' Bob ', 'ANNUAL_PAY': '60000', 'ACTIVE_FLAG': 'no', 'UNWANTED_COL': 'more garbage' },
      ];

      const mapping = {
        'F_NAME': 'firstName',
        'ANNUAL_PAY': 'salary',
        'ACTIVE_FLAG': 'isActive',
      };

      const result = transformRows({ rows, mapping, normalizedSchema: schema });

      expect(result.errors.length).toBe(0);
      expect(result.data.length).toBe(2);
      expect(result.stats).toEqual({ total: 2, valid: 2, invalid: 0 });

      expect(result.data[0]).toEqual({
        firstName: 'Alice',
        salary: 85000,
        isActive: true,
      });
      expect(result.data[0].UNWANTED_COL).toBeUndefined();
    });

    test('partitions invalid rows with row index and error reasons', () => {
      const rows = [
        { 'F_NAME': ' Charlie ', 'ANNUAL_PAY': '50000' },
        { 'F_NAME': '', 'ANNUAL_PAY': '30000' }, // missing required firstName
      ];

      const mapping = {
        'F_NAME': 'firstName',
        'ANNUAL_PAY': 'salary',
      };

      const result = transformRows({ rows, mapping, normalizedSchema: schema });

      expect(result.data.length).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].row).toBe(2);
      expect(result.errors[0].errors[0]).toMatch(/Field "firstName" is required/);
      expect(result.errors[0].raw['F_NAME']).toBe('');
    });
  });
});
