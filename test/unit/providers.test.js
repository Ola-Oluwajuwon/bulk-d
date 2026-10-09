const BaseProvider = require('../../src/providers/BaseProvider');
const OpenAIProvider = require('../../src/providers/OpenAIProvider');
const AnthropicProvider = require('../../src/providers/AnthropicProvider');
const GeminiProvider = require('../../src/providers/GeminiProvider');
const { createProvider } = require('../../src/providers/ProviderFactory');
const { MappingError, ProviderError, ValidationError } = require('../../src/errors');

class TestMockProvider extends BaseProvider {
  constructor(responseToReturn) {
    super({ apiKey: 'mock-key' });
    this.responseToReturn = responseToReturn;
  }
  async callProvider() {
    return this.responseToReturn;
  }
}

describe('AI Intelligence Providers', () => {
  describe('BaseProvider Response Parsing & Validation', () => {
    test('cleanJsonResponse extracts JSON from markdown fences', () => {
      const provider = new TestMockProvider('{}');
      const markdown = '```json\n{\n  "mapping": { "Col_A": "fieldA" }\n}\n```';
      const parsed = provider.cleanJsonResponse(markdown);
      expect(parsed).toEqual({ mapping: { Col_A: 'fieldA' } });
    });

    test('cleanJsonResponse throws MappingError on non-JSON text', () => {
      const provider = new TestMockProvider('{}');
      expect(() => provider.cleanJsonResponse('I am not JSON at all')).toThrow(MappingError);
    });

    test('validateMappingResponse removes hallucinated columns and tracks missing required fields', () => {
      const provider = new TestMockProvider('{}');
      const headers = ['Real_Col_1', 'Real_Col_2'];
      const fields = {
        name: { type: 'string', required: true },
        email: { type: 'string', required: true },
        phone: { type: 'string', required: false },
      };

      const responseObj = {
        mapping: {
          'Real_Col_1': 'name',
          'Fake_Col_Hallucinated': 'email',
          'Real_Col_2': 'non_existent_target',
        },
        unmapped: ['Real_Col_2'],
        confidence: { name: 0.98 },
      };

      const validated = provider.validateMappingResponse(responseObj, headers, fields);

      expect(validated.mapping).toEqual({ 'Real_Col_1': 'name' });
      expect(validated.missingRequired).toEqual(['email']);
      expect(validated.confidence.name).toBe(0.98);
    });
  });

  describe('ProviderFactory', () => {
    test('creates OpenAIProvider', () => {
      const p = createProvider({ provider: 'openai', apiKey: 'sk-test' });
      expect(p).toBeInstanceOf(OpenAIProvider);
    });

    test('creates AnthropicProvider', () => {
      const p = createProvider({ provider: 'anthropic', apiKey: 'sk-ant-test' });
      expect(p).toBeInstanceOf(AnthropicProvider);
    });

    test('creates GeminiProvider', () => {
      const p = createProvider({ provider: 'google', apiKey: 'gem-test' });
      expect(p).toBeInstanceOf(GeminiProvider);
    });

    test('creates custom OpenAI-compatible provider', () => {
      const p = createProvider({
        provider: 'custom',
        apiKey: 'groq-key',
        baseURL: 'https://api.groq.com/openai/v1',
      });
      expect(p).toBeInstanceOf(OpenAIProvider);
      expect(p.baseURL).toBe('https://api.groq.com/openai/v1');
    });

    test('throws ValidationError on unsupported provider', () => {
      expect(() => createProvider({ provider: 'unsupported-llm' })).toThrow(ValidationError);
    });
  });

  describe('Provider Network Execution (Mocked Fetch)', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    test('OpenAIProvider formats request and returns content', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"mapping":{"Full Name":"name"}}' } }],
        }),
      });

      const provider = new OpenAIProvider({ apiKey: 'sk-test' });
      const result = await provider.callProvider({
        systemPrompt: 'System',
        userPrompt: 'User',
      });

      expect(result).toBe('{"mapping":{"Full Name":"name"}}');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('AnthropicProvider formats request and returns content', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: '{"mapping":{"E-mail":"email"}}' }],
        }),
      });

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
      const result = await provider.callProvider({
        systemPrompt: 'System',
        userPrompt: 'User',
      });

      expect(result).toBe('{"mapping":{"E-mail":"email"}}');
    });

    test('GeminiProvider formats request and returns candidate text', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"mapping":{"DOB":"birthDate"}}' }] } }],
        }),
      });

      const provider = new GeminiProvider({ apiKey: 'gem-test' });
      const result = await provider.callProvider({
        systemPrompt: 'System',
        userPrompt: 'User',
      });

      expect(result).toBe('{"mapping":{"DOB":"birthDate"}}');
    });

    test('throws ProviderError on non-200 HTTP response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized API key',
      });

      const provider = new OpenAIProvider({ apiKey: 'sk-bad-key' });
      await expect(
        provider.callProvider({ systemPrompt: '', userPrompt: '' })
      ).rejects.toThrow(ProviderError);
    });
  });
});
