const { formatSchemaForPrompt, formatHeadersForPrompt } = require('./schemaFormatter');

/**
 * Builds the system prompt and user prompt for mapping spreadsheet columns to target database schemas.
 *
 * @param {object} params
 * @param {string[]} params.headers - Extracted spreadsheet headers.
 * @param {Record<string, { name: string, type: string, required: boolean, description?: string }>} params.fields - Target schema fields.
 * @param {Record<string, any[]>} [params.sampleValues={}] - Sample values per header.
 * @param {'low' | 'medium' | 'high'} [params.strictness='high'] - Strictness level.
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
function buildMappingPrompts({ headers, fields, sampleValues = {}, strictness = 'high' }) {
  const schemaSummary = formatSchemaForPrompt(fields);
  const headersSummary = formatHeadersForPrompt(headers, sampleValues);

  const strictnessGuideline =
    strictness === 'high'
      ? 'STRICT MODE (HIGH): Only map a spreadsheet column to a target field if there is strong semantic correspondence. If a column is ambiguous, omit it rather than guessing. Every REQUIRED target field should only be mapped if confident.'
      : 'FLEXIBLE MODE: Map spreadsheet columns to target fields using best-effort semantic similarity, accounting for common abbreviations and informal naming.';

  const systemPrompt = `You are a high-precision data integration engine. Your task is to analyze spreadsheet column headers and map each one to the most appropriate field in a predefined database schema.

RULES:
1. Return ONLY a single valid JSON object. No explanation text outside JSON, no markdown formatting.
2. The JSON structure MUST adhere to this exact shape:
{
  "mapping": {
    "<exact_spreadsheet_header>": "<exact_target_field_name>"
  },
  "unmapped": ["<spreadsheet_header_with_no_match>"],
  "confidence": {
    "<exact_target_field_name>": <number between 0.0 and 1.0>
  }
}
3. The keys of "mapping" MUST be verbatim spreadsheet headers from the provided list.
4. The values of "mapping" MUST be verbatim target schema field names from the provided list.
5. Do NOT map multiple spreadsheet columns to the same target field. If there are duplicates, choose the best match.
6. Columns that do not correspond to any target field MUST be placed in the "unmapped" array.
7. ${strictnessGuideline}`;

  const userPrompt = `TARGET DATABASE SCHEMA:
${schemaSummary}

SPREADSHEET COLUMNS TO MAP:
${headersSummary}

Generate the JSON mapping now.`;

  return {
    systemPrompt,
    userPrompt,
  };
}

module.exports = {
  buildMappingPrompts,
};
