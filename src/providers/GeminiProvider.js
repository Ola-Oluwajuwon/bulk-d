const BaseProvider = require('./BaseProvider');
const { ProviderError } = require('../errors');

/**
 * Google Gemini API provider implementation.
 */
class GeminiProvider extends BaseProvider {
  /**
   * @param {object} config
   * @param {string} config.apiKey - Google AI Studio API key.
   * @param {string} [config.model='gemini-1.5-flash'] - Model identifier.
   * @param {number} [config.timeoutMs=30000] - Request timeout in milliseconds.
   * @param {number} [config.maxRetries=3] - Maximum retry attempts.
   */
  constructor(config = {}) {
    super(config);
    this.model = config.model || 'gemini-1.5-flash';

    if (!this.apiKey) {
      throw new ProviderError('Google Gemini provider requires an apiKey.', { provider: 'google' });
    }
  }

  /**
   * Calls the Google Gemini generateContent endpoint.
   *
   * @param {object} prompts
   * @param {string} prompts.systemPrompt
   * @param {string} prompts.userPrompt
   * @returns {Promise<string>}
   */
  async callProvider({ systemPrompt, userPrompt }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const payload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    };

    let response;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new ProviderError(`Google Gemini request timed out after ${this.timeoutMs}ms.`, {
          provider: 'google',
          timeout: true,
        });
      }
      throw new ProviderError(`Google Gemini network connection failed: ${err.message}`, {
        provider: 'google',
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

      throw new ProviderError(`Google Gemini API responded with status ${response.status}: ${errBody}`, {
        provider: 'google',
        statusCode: response.status,
        details: errBody,
      });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new ProviderError('Google Gemini returned empty candidate text.', {
        provider: 'google',
        data,
      });
    }

    return text;
  }
}

module.exports = GeminiProvider;
