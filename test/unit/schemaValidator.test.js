const { z } = require('zod');
const { normalizeTargetSchema } = require('../../src/validation/schemaValidator');
const { ValidationError } = require('../../src/errors');

describe('Schema Validator', () => {
  describe('Plain Object Schemas', () => {
    test('normalizes a valid plain schema', () => {
      const plain = {
        firstName: { type: 'string', required: true, description: 'First name' },
        age: { type: 'number', required: false },
        isActive: 'boolean',
      };

      const normalized = normalizeTargetSchema(plain);
      expect(normalized.isZod).toBe(false);
      expect(normalized.fields.firstName).toEqual({
        name: 'firstName',
        type: 'string',
        required: true,
        description: 'First name',
      });
      expect(normalized.fields.age).toEqual({
        name: 'age',
        type: 'number',
        required: false,
        description: undefined,
      });
      expect(normalized.fields.isActive).toEqual({
        name: 'isActive',
        type: 'boolean',
        required: false,
      });
    });

    test('validates valid row against plain schema', () => {
      const schema = {
        name: { type: 'string', required: true },
        score: { type: 'number', required: false },
      };
      const normalized = normalizeTargetSchema(schema);

      const res = normalized.validateRow({ name: 'Alice', score: 100 });
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ name: 'Alice', score: 100 });
    });

    test('detects missing required fields in plain schema', () => {
      const schema = {
        email: { type: 'string', required: true },
      };
      const normalized = normalizeTargetSchema(schema);

      const res = normalized.validateRow({ email: '' });
      expect(res.success).toBe(false);
      expect(res.errors[0]).toMatch(/Field "email" is required/);
    });

    test('throws ValidationError if schema is empty or not an object', () => {
      expect(() => normalizeTargetSchema(null)).toThrow(ValidationError);
      expect(() => normalizeTargetSchema({})).toThrow(ValidationError);
    });
  });

  describe('Zod Schemas', () => {
    test('normalizes a Zod object schema', () => {
      const zodSchema = z.object({
        username: z.string().describe('User handle'),
        balance: z.number().optional(),
        registeredAt: z.date().optional(),
      });

      const normalized = normalizeTargetSchema(zodSchema);
      expect(normalized.isZod).toBe(true);
      expect(normalized.fields.username.name).toBe('username');
      expect(normalized.fields.username.type).toBe('string');
      expect(normalized.fields.username.required).toBe(true);
      expect(normalized.fields.username.description).toBe('User handle');

      expect(normalized.fields.balance.type).toBe('number');
      expect(normalized.fields.balance.required).toBe(false);

      expect(normalized.fields.registeredAt.type).toBe('date');
      expect(normalized.fields.registeredAt.required).toBe(false);
    });

    test('validates valid row using Zod safeParse', () => {
      const zodSchema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
      });
      const normalized = normalizeTargetSchema(zodSchema);

      const res = normalized.validateRow({ email: 'test@example.com', age: 25 });
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ email: 'test@example.com', age: 25 });
    });

    test('returns formatted errors when Zod validation fails', () => {
      const zodSchema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
      });
      const normalized = normalizeTargetSchema(zodSchema);

      const res = normalized.validateRow({ email: 'not-an-email', age: 10 });
      expect(res.success).toBe(false);
      expect(res.errors.length).toBe(2);
    });
  });
});
