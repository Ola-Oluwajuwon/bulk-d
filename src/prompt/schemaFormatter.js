/**
 * Formats normalized schema fields into a compact representation for LLM prompts.
 *
 * @param {Record<string, { name: string, type: string, required: boolean, description?: string }>} fields
 * @returns {string} Formatted schema summary
 */
function formatSchemaForPrompt(fields) {
  const lines = [];

  for (const [key, def] of Object.entries(fields)) {
    let line = `- "${key}" (${def.type}, ${def.required ? 'REQUIRED' : 'optional'})`;
    if (def.description) {
      line += `: ${def.description}`;
    }
    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Formats column headers and their optional sample values for the prompt.
 *
 * @param {string[]} headers
 * @param {Record<string, any[]>} [sampleValues={}]
 * @returns {string}
 */
function formatHeadersForPrompt(headers, sampleValues = {}) {
  const lines = [];

  for (const header of headers) {
    const samples = sampleValues[header] || [];
    if (samples.length > 0) {
      const sampleStr = samples.map((s) => JSON.stringify(s)).join(', ');
      lines.push(`- "${header}" (sample values: ${sampleStr})`);
    } else {
      lines.push(`- "${header}"`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  formatSchemaForPrompt,
  formatHeadersForPrompt,
};
