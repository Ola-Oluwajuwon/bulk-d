const XLSX = require('xlsx');
const { z } = require('zod');
const BulkD = require('../../src/index');

describe('BulkD End-to-End Integration Tests', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('one-shot processFile with CSV buffer and plain schema', async () => {
    // Mock OpenAI response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mapping: {
                  'First_Name': 'firstName',
                  'Last_Name': 'lastName',
                  'Email_Address': 'email',
                  'User_Age': 'age',
                },
                unmapped: ['Internal_Notes'],
                confidence: {
                  firstName: 0.99,
                  lastName: 0.99,
                  email: 0.99,
                  age: 0.95,
                },
              }),
            },
          },
        ],
      }),
    });

    const csvContent =
      'First_Name,Last_Name,Email_Address,User_Age,Internal_Notes\n' +
      'Alice,Smith,alice@example.com,28,good customer\n' +
      'Bob,Jones,bob@example.com,34,active\n' +
      ',Ghost,,invalid_age,bad row';

    const buffer = Buffer.from(csvContent, 'utf-8');

    const mapper = new BulkD({
      provider: 'openai',
      apiKey: 'test-key',
    });

    const targetSchema = {
      firstName: { type: 'string', required: true },
      lastName: { type: 'string', required: true },
      email: { type: 'string', required: true },
      age: { type: 'number', required: false },
    };

    const result = await mapper.processFile({
      buffer,
      mimetype: 'text/csv',
      schema: targetSchema,
    });

    expect(result.mapping).toEqual({
      'First_Name': 'firstName',
      'Last_Name': 'lastName',
      'Email_Address': 'email',
      'User_Age': 'age',
    });

    expect(result.stats).toEqual({ total: 3, valid: 2, invalid: 1 });
    expect(result.data.length).toBe(2);
    expect(result.data[0]).toEqual({
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      age: 28,
    });
    expect(result.data[1]).toEqual({
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob@example.com',
      age: 34,
    });

    // Row 3 failed because firstName and email were empty
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].row).toBe(3);
    expect(result.errors[0].errors).toEqual(
      expect.arrayContaining(['Field "firstName" is required.', 'Field "email" is required.'])
    );
  });

  test('one-shot processFile with Excel XLSX buffer and Zod schema', async () => {
    // Generate XLSX in-memory
    const wb = XLSX.utils.book_new();
    const sheetData = [
      ['Emp_ID', 'Full_Name', 'Join_Date', 'Salary'],
      ['E101', 'Diana Prince', '2023-01-15', '$120,000'],
      ['E102', 'Clark Kent', '2022-06-01', '$95,000'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Mock Anthropic response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              mapping: {
                'Full_Name': 'name',
                'Join_Date': 'joinedAt',
                'Salary': 'compensation',
              },
              unmapped: ['Emp_ID'],
              confidence: { name: 0.99, joinedAt: 0.98, compensation: 0.97 },
            }),
          },
        ],
      }),
    });

    const mapper = new BulkD({
      provider: 'anthropic',
      apiKey: 'test-ant-key',
    });

    const zodSchema = z.object({
      name: z.string().min(2),
      joinedAt: z.date(),
      compensation: z.number().positive(),
    });

    const result = await mapper.processFile({
      buffer: xlsxBuffer,
      filename: 'staff.xlsx',
      schema: zodSchema,
    });

    expect(result.data.length).toBe(2);
    expect(result.errors.length).toBe(0);
    expect(result.data[0].name).toBe('Diana Prince');
    expect(result.data[0].compensation).toBe(120000);
    expect(result.data[0].joinedAt).toBeInstanceOf(Date);
  });

  test('two-step workflow: getMapping() followed by transform()', async () => {
    // Mock Gemini response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    mapping: {
                      'raw_sku': 'sku',
                      'item_cost': 'price',
                    },
                    unmapped: [],
                    confidence: { sku: 0.95, price: 0.92 },
                  }),
                },
              ],
            },
          },
        ],
      }),
    });

    const mapper = new BulkD({
      provider: 'google',
      apiKey: 'test-gem-key',
    });

    const csvContent = 'raw_sku,item_cost\nABC-123,49.99\nXYZ-789,19.50';
    const buffer = Buffer.from(csvContent);

    const schema = {
      sku: { type: 'string', required: true },
      price: { type: 'number', required: true },
    };

    // Step 1: Preview mapping
    const mappingInfo = await mapper.getMapping({
      buffer,
      mimetype: 'text/csv',
      schema,
    });

    expect(mappingInfo.headers).toEqual(['raw_sku', 'item_cost']);
    expect(mappingInfo.mapping).toEqual({
      'raw_sku': 'sku',
      'item_cost': 'price',
    });

    // Step 2: Transform with confirmed mapping
    const transformResult = await mapper.transform({
      buffer,
      mimetype: 'text/csv',
      schema,
      mapping: mappingInfo.mapping,
    });

    expect(transformResult.data.length).toBe(2);
    expect(transformResult.data[0]).toEqual({ sku: 'ABC-123', price: 49.99 });
  });
});
