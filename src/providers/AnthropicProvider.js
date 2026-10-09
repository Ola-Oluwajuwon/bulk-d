const BaseProvider = require('./BaseProvider');
const { ProviderError } = require('../errors');

/**
 * Anthropic Claude API provider implementation.
 */
class AnthropicProvider extends BaseProvider {
  /**
   * @param {object} config
   * @param {string} config.apiKey - Anthropic API key.
   * @param {string} [config.model='claude-3-5-haiku-20241022'] - Model identifier.
   * @param {string} [config.baseURL='https://api.anthropic.com'] - Custom base URL.
   * @param {number} [config.timeoutMs=30000] - Request timeout in milliseconds.
   * @param {number} [config.maxRetries=3] - Maximum retry attempts.
   */
  constructor(config = {}) {
    super(config);
    this.model = config.model || 'claude-3-5-haiku-20241022';
    this.baseURL = (config.baseURL || 'https://api.anthropic.com').replace(/\/+$/, '');

    if (!this.apiKey) {
      throw new ProviderError('Anthropic provider requires an apiKey.', { provider: 'anthropic' });
    }
  }

  /**
   * Calls the Anthropic Messages endpoint.
   *
   * @param {object} prompts
   * @param {string} prompts.systemPrompt
   * @param {string} prompts.userPrompt
   * @returns {Promise<string>}
   */
  async callProvider({ systemPrompt, userPrompt }) {
    const url = `${this.baseURL}/v1/messages`;

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };

    const payload = {
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.1,
    };

    let response;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new ProviderError(`Anthropic request timed out after ${this.timeoutMs}ms.`, {
          provider: 'anthropic',
          timeout: true,
        });
      }
      throw new ProviderError(`Anthropic network connection failed: ${err.message}`, {
        provider: 'anthropic',
        originalError: err,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let errBody = '';
      try {
        errBody = await response.text();
      } catch (_) {}

      throw new ProviderError(`Anthropic API responded with status ${response.status}: ${errBody}`, {
        provider: 'anthropic',
        statusCode: response.status,
        details: errBody,
      });
    }

    const data = await response.json();
    const textBlock = data?.content?.find((c) => c.type === 'text') || data?.content?.[0];
    const text = textBlock?.text;

    if (!text) {
      throw new ProviderError('Anthropic returned empty content in response.', {
        provider: 'anthropic',
        data,
      });
    }

    return text;
  }
}

module.exports = AnthropicProvider;
