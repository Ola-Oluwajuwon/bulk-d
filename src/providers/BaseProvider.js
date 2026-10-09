const { MappingError, ProviderError } = require('../errors');
const { retryWithBackoff } = require('../utils/retry');
const { buildMappingPrompts } = require('../prompt/systemPrompt');

/**
 * Abstract Base Provider for AI intelligence integrations.
 */
class BaseProvider {
  /**
   * @param {object} config
   * @param {string} config.apiKey - API key for provider.
   * @param {string} [config.model] - Specific model name.
   * @param {number} [config.timeoutMs=30000] - Timeout in milliseconds.
   * @param {number} [config.maxRetries=3] - Maximum retry attempts.
   */
  constructor(config = {}) {
    if (new.target === BaseProvider) {
      throw new TypeError('Cannot construct BaseProvider directly; subclass it.');
    }
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs || 30000;
    this.maxRetries = config.maxRetries !== undefined ? config.maxRetries : 3;
  }

  /**
   * Sanitizes and extracts JSON from raw LLM output.
   * Handles markdown code fences (```json ... ```) and edge noise.
   *
   * @param {string} raw
   * @returns {any}
   */
  cleanJsonResponse(raw) {
    if (!raw || typeof raw !== 'string') {
      throw new MappingError('Received empty response from AI provider.');
    }

    let cleaned = raw.trim();

    // Strip markdown code fences
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    }

    // Try finding the first '{' and last '}'
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(cleaned);
    } catch (err) {
      throw new MappingError(`AI provider returned non-parseable JSON: ${err.message}`, {
        rawOutput: raw,
      });
    }
  }

  /**
   * Validates that the AI's returned mapping adheres to the extracted headers and target schema.
   *
   * @param {object} responseObj
   * @param {string[]} headers
   * @param {Record<string, any>} fields
   * @returns {{ mapping: Record<string, string>, unmapped: string[], confidence: Record<string, number> }}
   */
  validateMappingResponse(responseObj, headers, fields) {
    if (!responseObj || typeof responseObj !== 'object') {
      throw new MappingError('AI response is not an object.');
    }

    const rawMapping = responseObj.mapping || {};
    const unmapped = Array.isArray(responseObj.unmapped) ? responseObj.unmapped : [];
    const confidence = responseObj.confidence || {};

    const headerSet = new Set(headers);
    const validFieldNames = new Set(Object.keys(fields));

    const sanitizedMapping = {};
    const usedTargetFields = new Set();

    for (const [col, targetField] of Object.entries(rawMapping)) {
      if (!headerSet.has(col)) {
        // AI fabricated a column not in spreadsheet; ignore
        continue;
      }
      if (!validFieldNames.has(targetField)) {
        // AI mapped to non-existent target field; ignore
        continue;
      }
      if (usedTargetFields.has(targetField)) {
        // Duplicate target assignment; first wins
        continue;
      }

      sanitizedMapping[col] = targetField;
      usedTargetFields.add(targetField);
    }

    // Check for missing REQUIRED target fields
    const missingRequired = [];
    for (const [fieldName, fieldDef] of Object.entries(fields)) {
      if (fieldDef.required && !usedTargetFields.has(fieldName)) {
        missingRequired.push(fieldName);
      }
    }

    return {
      mapping: sanitizedMapping,
      unmapped,
      confidence,
      missingRequired,
    };
  }

  /**
   * Abstract method: Subclasses must execute HTTP call to their specific provider.
   *
   * @param {object} params
   * @param {string} params.systemPrompt
   * @param {string} params.userPrompt
   * @returns {Promise<string>} Raw text output from provider.
   */
  async callProvider(params) {
    throw new Error('callProvider must be implemented by subclass.');
  }

  /**
   * Orchestrates prompt building, network call with retry, response parsing, and validation.
   *
   * @param {object} params
   * @param {string[]} params.headers
   * @param {Record<string, any>} params.fields
   * @param {Record<string, any[]>} [params.sampleValues]
   * @param {'low' | 'medium' | 'high'} [params.strictness]
   * @returns {Promise<{ mapping: Record<string, string>, unmapped: string[], confidence: Record<string, number>, missingRequired: string[] }>}
   */
  async mapHeaders(params) {
    const { headers, fields, sampleValues = {}, strictness = 'high' } = params;

    const prompts = buildMappingPrompts({
      headers,
      fields,
      sampleValues,
      strictness,
    });

    const rawOutput = await retryWithBackoff(
      async () => {
        return await this.callProvider(prompts);
      },
      {
        maxRetries: this.maxRetries,
        shouldRetry: (err) => {
          // Retry on network/timeout/rate-limit (429, 500, 502, 503, 504)
          if (err instanceof ProviderError) {
            const status = err.details?.statusCode;
            return !status || status === 429 || status >= 500;
          }
          return true;
        },
      }
    );

    const parsedJson = this.cleanJsonResponse(rawOutput);
    return this.validateMappingResponse(parsedJson, headers, fields);
  }
}

module.exports = BaseProvider;
