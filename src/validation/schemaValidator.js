const { ValidationError } = require('../errors');

/**
 * Supported primitive types for type casting and validation.
 */
const SUPPORTED_TYPES = ['string', 'number', 'date', 'boolean', 'any'];

/**
 * Inspects a Zod field definition to extract type, optionality, and description.
 *
 * @param {any} zodField
 * @returns {{ type: string, required: boolean, description?: string }}
 */
function inspectZodField(zodField) {
  let current = zodField;
  let required = true;
  let description = current?.description;

  // Unwrap optional, nullable, default, effects, etc.
  while (current) {
    const typeProp = (current._def?.type || current._def?.typeName || current.constructor?.name || '').toLowerCase();

    if (
      typeProp.includes('optional') ||
      typeProp.includes('nullable') ||
      typeProp.includes('default')
    ) {
      required = false;
      if (!description && current.description) description = current.description;
      current = current.innerType || current._def?.innerType;
    } else if (typeProp.includes('effect')) {
      current = current.schema || current._def?.schema;
    } else {
      break;
    }
  }

  const typeIdentifier = (
    current?._def?.type ||
    current?._def?.typeName ||
    current?.constructor?.name ||
    ''
  ).toLowerCase();

  let type = 'string';

  if (typeIdentifier.includes('number')) {
    type = 'number';
  } else if (typeIdentifier.includes('boolean')) {
    type = 'boolean';
  } else if (typeIdentifier.includes('date')) {
    type = 'date';
  } else if (typeIdentifier.includes('string')) {
    type = 'string';
  } else {
    type = 'any';
  }

  return {
    type,
    required,
    description: description || current?.description,
  };
}

/**
 * Validates and normalizes any supported target schema (plain object or Zod schema).
 *
 * @param {object} inputSchema - Plain object schema or Zod object schema.
 * @returns {object} Normalized schema object with fields and validateRow method.
 */
function normalizeTargetSchema(inputSchema) {
  if (!inputSchema || typeof inputSchema !== 'object') {
    throw new ValidationError('Target schema must be a valid object or Zod schema.');
  }

  const isZod = typeof inputSchema.safeParse === 'function' && Boolean(inputSchema._def);

  /** @type {Record<string, { name: string, type: string, required: boolean, description?: string }>} */
  const fields = {};

  if (isZod) {
    // Determine shape from Zod object
    let shape = null;
    if (typeof inputSchema._def.shape === 'function') {
      shape = inputSchema._def.shape();
    } else if (inputSchema._def.shape) {
      shape = inputSchema._def.shape;
    } else if (inputSchema.shape) {
      shape = inputSchema.shape;
    }

    if (!shape) {
      throw new ValidationError('Zod schema must be a z.object() with defined shape.');
    }

    for (const [key, fieldDef] of Object.entries(shape)) {
      const inspected = inspectZodField(fieldDef);
      fields[key] = {
        name: key,
        ...inspected,
      };
    }
  } else {
    // Plain JS object schema
    for (const [key, def] of Object.entries(inputSchema)) {
      if (typeof def === 'string') {
        const lowerType = def.toLowerCase();
        fields[key] = {
          name: key,
          type: SUPPORTED_TYPES.includes(lowerType) ? lowerType : 'string',
          required: false,
        };
      } else if (typeof def === 'object' && def !== null) {
        const rawType = (def.type || 'string').toLowerCase();
        const type = SUPPORTED_TYPES.includes(rawType) ? rawType : 'string';
        fields[key] = {
          name: key,
          type,
          required: Boolean(def.required),
          description: def.description || undefined,
        };
      } else {
        throw new ValidationError(`Invalid schema definition for field "${key}".`);
      }
    }
  }

  if (Object.keys(fields).length === 0) {
    throw new ValidationError('Target schema must define at least one field.');
  }

  /**
   * Validates a single transformed row against the schema.
   *
   * @param {Record<string, any>} row
   * @returns {{ success: boolean, data?: Record<string, any>, errors?: string[] }}
   */
  const validateRow = (row) => {
    if (isZod) {
      const parsed = inputSchema.safeParse(row);
      if (parsed.success) {
        return { success: true, data: parsed.data };
      }
      const errorMessages = parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || 'field'}: ${issue.message}`
      );
      return { success: false, errors: errorMessages };
    }

    // Manual validation for plain object schema
    const errors = [];
    const sanitizedData = {};

    for (const [fieldName, fieldDef] of Object.entries(fields)) {
      const val = row[fieldName];
      const isMissing = val === undefined || val === null || val === '';

      if (fieldDef.required && isMissing) {
        errors.push(`Field "${fieldName}" is required.`);
        continue;
      }

      if (!isMissing) {
        sanitizedData[fieldName] = val;
      } else {
        sanitizedData[fieldName] = null;
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true, data: sanitizedData };
  };

  return {
    fields,
    isZod,
    rawSchema: inputSchema,
    validateRow,
  };
}

module.exports = {
  SUPPORTED_TYPES,
  normalizeTargetSchema,
};
