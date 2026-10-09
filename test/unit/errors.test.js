const {
  BulkDError,
  ParsingError,
  MappingError,
  ProviderError,
  ValidationError,
} = require('../../src/errors');

describe('Custom Error Classes', () => {
  test('BulkDError is an instance of Error', () => {
    const err = new BulkDError('Something broke', 'BULK_ERROR', { extra: 123 });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BulkDError);
    expect(err.name).toBe('BulkDError');
    expect(err.code).toBe('BULK_ERROR');
    expect(err.details).toEqual({ extra: 123 });
  });

  test('ParsingError inherits from BulkDError', () => {
    const err = new ParsingError('Corrupt CSV', { line: 10 });
    expect(err).toBeInstanceOf(BulkDError);
    expect(err).toBeInstanceOf(ParsingError);
    expect(err.name).toBe('ParsingError');
    expect(err.code).toBe('PARSING_ERROR');
    expect(err.details).toEqual({ line: 10 });
  });

  test('MappingError inherits from BulkDError', () => {
    const err = new MappingError('Missing required field', { field: 'email' });
    expect(err).toBeInstanceOf(BulkDError);
    expect(err).toBeInstanceOf(MappingError);
    expect(err.code).toBe('MAPPING_ERROR');
  });

  test('ProviderError inherits from BulkDError', () => {
    const err = new ProviderError('Rate limit exceeded', { statusCode: 429 });
    expect(err).toBeInstanceOf(BulkDError);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err.details.statusCode).toBe(429);
  });

  test('ValidationError inherits from BulkDError', () => {
    const err = new ValidationError('Schema invalid', { key: 'firstName' });
    expect(err).toBeInstanceOf(BulkDError);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});
