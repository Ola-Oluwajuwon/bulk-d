const { assertServerEnvironment } = require('../../src/utils/environment');

describe('Environment Security Guard', () => {
  afterEach(() => {
    delete global.window;
    delete global.document;
  });

  test('assertServerEnvironment passes in standard Node environment', () => {
    expect(() => assertServerEnvironment()).not.toThrow();
  });

  test('assertServerEnvironment throws when window is defined', () => {
    global.window = {};
    expect(() => assertServerEnvironment()).toThrow(/Security Violation/);
  });

  test('assertServerEnvironment throws when document is defined', () => {
    global.document = {};
    expect(() => assertServerEnvironment()).toThrow(/Security Violation/);
  });
});
