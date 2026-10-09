const BaseProvider = require('./BaseProvider');
const { ProviderError } = require('../errors');

/**
 * OpenAI API provider implementation.
 * Also serves as the base for OpenAI-compatible APIs (Groq, OpenRouter, Ollama).
 */
class OpenAIProvider extends BaseProvider {
  /**
   * @param {object} config
   * @param {string} [config.apiKey] - OpenAI API key.
   * @param {string} [config.model='gpt-4o-mini'] - Model identifier.
   * @param {string} [config.baseURL='https://api.openai.com/v1'] - Custom base URL.
   * @param {number} [config.timeoutMs=30000] - Request timeout in milliseconds.
   * @param {number} [config.maxRetries=3] - Maximum retry attempts.
   */
  constructor(config = {}) {
    super(config);
    this.model = config.model || 'gpt-4o-mini';
    this.baseURL = (config.baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '');

    if (!this.apiKey && !config.baseURL) {
      throw new ProviderError('OpenAI provider requires an apiKey.', { provider: 'openai' });
    }
  }

  /**
   * Calls the OpenAI Chat Completions endpoint.
   *
   * @param {object} prompts
   * @param {string} prompts.systemPrompt
   * @param {string} prompts.userPrompt
   * @returns {Promise<string>}
   */
  async callProvider({ systemPrompt, userPrompt }) {
    const url = `${this.baseURL}/chat/completions`;

    const headers = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const payload = {
      model: this.model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
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
        throw new ProviderError(`OpenAI request timed out after ${this.timeoutMs}ms.`, {
          provider: 'openai',
          timeout: true,
        });
      }
      throw new ProviderError(`OpenAI network connection failed: ${err.message}`, {
        provider: 'openai',
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

      throw new ProviderError(`OpenAI API responded with status ${response.status}: ${errBody}`, {
        provider: 'openai',
        statusCode: response.status,
        details: errBody,
      });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new ProviderError('OpenAI returned empty message content in response choices.', {
        provider: 'openai',
        data,
      });
    }

    return content;
  }
}

module.exports = OpenAIProvider;
