const OpenAIProvider = require('./OpenAIProvider');
const AnthropicProvider = require('./AnthropicProvider');
const GeminiProvider = require('./GeminiProvider');
const { ValidationError } = require('../errors');

/**
 * Creates and returns the appropriate provider instance based on configuration.
 *
 * @param {object} config
 * @param {'openai' | 'anthropic' | 'google' | 'gemini' | 'custom' | string} config.provider
 * @param {string} [config.apiKey]
 * @param {string} [config.model]
 * @param {string} [config.baseURL]
 * @param {number} [config.timeoutMs]
 * @param {number} [config.maxRetries]
 * @returns {import('./BaseProvider')}
 */
function createProvider(config = {}) {
  const providerName = (config.provider || 'openai').toLowerCase().trim();

  switch (providerName) {
    case 'openai':
      return new OpenAIProvider(config);

    case 'anthropic':
      return new AnthropicProvider(config);

    case 'google':
    case 'gemini':
      return new GeminiProvider(config);

    case 'custom':
    case 'openai-compatible':
    case 'groq':
    case 'openrouter':
    case 'ollama':
      return new OpenAIProvider(config);

    default:
      throw new ValidationError(
        `Unsupported AI provider: "${config.provider}". Supported providers are: openai, anthropic, google, gemini, custom.`
      );
  }
}

module.exports = {
  createProvider,
};
