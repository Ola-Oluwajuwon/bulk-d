const { assertServerEnvironment } = require('./utils/environment');
const errors = require('./errors');
const { parseTabularData, parseCsv, parseExcel } = require('./parsers');
const { createProvider } = require('./providers/ProviderFactory');
const { normalizeTargetSchema } = require('./validation/schemaValidator');
const { transformRows } = require('./transformers/rowTransformer');

/**
 * Main bulk-d client class.
 * Provides intelligent, AI-driven spreadsheet column mapping and schema transformation.
 */
class BulkD {
  /**
   * Initializes the BulkD client.
   *
   * @param {object} [config]
   * @param {'openai' | 'anthropic' | 'google' | 'gemini' | 'custom' | string} [config.provider='openai'] - AI provider.
   * @param {string} [config.apiKey] - Provider API key.
   * @param {string} [config.model] - Specific AI model identifier.
   * @param {string} [config.baseURL] - Custom base URL for OpenAI-compatible providers.
   * @param {'low' | 'medium' | 'high'} [config.strictness='high'] - Mapping strictness.
   * @param {number} [config.timeoutMs=30000] - Request timeout in milliseconds.
   * @param {number} [config.maxRetries=3] - Maximum retry attempts.
   */
  constructor(config = {}) {
    assertServerEnvironment();

    this.config = {
      provider: config.provider || 'openai',
      apiKey: config.apiKey || null,
      model: config.model || null,
      baseURL: config.baseURL || null,
      strictness: config.strictness || 'high',
      timeoutMs: config.timeoutMs !== undefined ? config.timeoutMs : 30000,
      maxRetries: config.maxRetries !== undefined ? config.maxRetries : 3,
    };

    // Lazily or immediately initialize provider if apiKey or custom baseURL is provided
    this.provider = createProvider(this.config);
  }

  /**
   * Analyzes spreadsheet headers and returns the AI-recommended column mapping strategy.
   * Useful for two-step workflows where user confirmation is required before processing.
   *
   * @param {object} params
   * @param {Buffer} [params.buffer] - Raw file buffer.
   * @param {import('stream').Readable} [params.stream] - File stream.
   * @param {string} [params.mimetype] - MIME type of the spreadsheet.
   * @param {string} [params.filename] - Original filename.
   * @param {string[]} [params.headers] - Pre-extracted headers (if file was already parsed).
   * @param {Record<string, any[]>} [params.sampleValues] - Pre-extracted sample values.
   * @param {object} params.schema - Target schema (plain object or Zod schema).
   * @param {'low' | 'medium' | 'high'} [params.strictness] - Override default strictness.
   * @returns {Promise<{ headers: string[], mapping: Record<string, string>, unmapped: string[], confidence: Record<string, number>, missingRequired: string[], sampleValues: Record<string, any[]> }>}
   */
  async getMapping(params) {
    assertServerEnvironment();

    const {
      buffer,
      stream,
      mimetype,
      filename,
      schema,
      strictness = this.config.strictness,
    } = params;

    const normalizedSchema = normalizeTargetSchema(schema);

    let headers = params.headers;
    let sampleValues = params.sampleValues || {};

    if (!headers || headers.length === 0) {
      const parsed = await parseTabularData({ buffer, stream, mimetype, filename });
      headers = parsed.headers;
      sampleValues = parsed.sampleValues;
    }

    const mappingResult = await this.provider.mapHeaders({
      headers,
      fields: normalizedSchema.fields,
      sampleValues,
      strictness,
    });

    return {
      headers,
      sampleValues,
      ...mappingResult,
    };
  }

  /**
   * Transforms and validates parsed rows or file buffer using an explicit mapping.
   *
   * @param {object} params
   * @param {Buffer} [params.buffer] - Raw file buffer.
   * @param {import('stream').Readable} [params.stream] - File stream.
   * @param {Array<Record<string, any>>} [params.rows] - Pre-parsed rows.
   * @param {string} [params.mimetype] - MIME type of the spreadsheet.
   * @param {string} [params.filename] - Original filename.
   * @param {object} params.schema - Target schema (plain object or Zod schema).
   * @param {Record<string, string>} params.mapping - Map of spreadsheet_col -> target_field.
   * @returns {Promise<{ data: Array<Record<string, any>>, errors: Array<{ row: number, errors: string[], raw: Record<string, any> }>, stats: { total: number, valid: number, invalid: number } }>}
   */
  async transform(params) {
    assertServerEnvironment();

    const { buffer, stream, mimetype, filename, schema, mapping } = params;

    if (!mapping || typeof mapping !== 'object') {
      throw new errors.MappingError('A valid mapping object is required for transform().');
    }

    const normalizedSchema = normalizeTargetSchema(schema);

    let rows = params.rows;
    if (!rows) {
      const parsed = await parseTabularData({ buffer, stream, mimetype, filename });
      rows = parsed.rows;
    }

    return transformRows({
      rows,
      mapping,
      normalizedSchema,
    });
  }

  /**
   * One-shot execution: parses spreadsheet, prompts AI for column mapping,
   * transforms rows, coerces types, and partitions valid data vs row errors.
   *
   * @param {object} params
   * @param {Buffer} [params.buffer] - Raw file buffer.
   * @param {import('stream').Readable} [params.stream] - File stream.
   * @param {string} [params.mimetype] - MIME type of the spreadsheet.
   * @param {string} [params.filename] - Original filename.
   * @param {object} params.schema - Target schema (plain object or Zod schema).
   * @param {Record<string, string>} [params.mapping] - Optional pre-defined mapping (skips AI if provided).
   * @param {'low' | 'medium' | 'high'} [params.strictness] - Strictness level.
   * @returns {Promise<{ data: Array<Record<string, any>>, errors: Array<{ row: number, errors: string[], raw: Record<string, any> }>, mapping: Record<string, string>, unmapped: string[], confidence: Record<string, number>, stats: { total: number, valid: number, invalid: number } }>}
   */
  async processFile(params) {
    assertServerEnvironment();

    const {
      buffer,
      stream,
      mimetype,
      filename,
      schema,
      strictness = this.config.strictness,
    } = params;

    // Step 1: Normalize target schema
    const normalizedSchema = normalizeTargetSchema(schema);

    // Step 2: Parse raw spreadsheet data
    const parsed = await parseTabularData({ buffer, stream, mimetype, filename });

    // Step 3: Determine mapping (AI or provided override)
    let mapping = params.mapping;
    let unmapped = [];
    let confidence = {};

    if (!mapping) {
      const mappingResult = await this.provider.mapHeaders({
        headers: parsed.headers,
        fields: normalizedSchema.fields,
        sampleValues: parsed.sampleValues,
        strictness,
      });

      mapping = mappingResult.mapping;
      unmapped = mappingResult.unmapped;
      confidence = mappingResult.confidence;
    }

    // Step 4: Transform and validate rows
    const transformResult = transformRows({
      rows: parsed.rows,
      mapping,
      normalizedSchema,
    });

    return {
      data: transformResult.data,
      errors: transformResult.errors,
      mapping,
      unmapped,
      confidence,
      stats: transformResult.stats,
    };
  }
}

// Module exports
module.exports = BulkD;
module.exports.BulkD = BulkD;
module.exports.BulkDError = errors.BulkDError;
module.exports.ParsingError = errors.ParsingError;
module.exports.MappingError = errors.MappingError;
module.exports.ProviderError = errors.ProviderError;
module.exports.ValidationError = errors.ValidationError;
module.exports.parseTabularData = parseTabularData;
module.exports.parseCsv = parseCsv;
module.exports.parseExcel = parseExcel;
module.exports.createProvider = createProvider;
module.exports.normalizeTargetSchema = normalizeTargetSchema;
module.exports.transformRows = transformRows;
module.exports.assertServerEnvironment = assertServerEnvironment;
