const XLSX = require('xlsx');
const { Readable } = require('stream');
const {
  parseCsv,
  parseExcel,
  parseTabularData,
  detectFormat,
  extractHeaders,
  extractSampleValues,
} = require('../../src/parsers');
const { ParsingError } = require('../../src/errors');

describe('Parsers & Header Extraction', () => {
  describe('extractHeaders & extractSampleValues', () => {
    test('cleans and dedupes headers', () => {
      const rows = [
        { ' First Name ': 'John', Age: '30' },
        { ' First Name ': 'Jane', Email: 'jane@test.com' },
      ];
      const explicit = [' First Name ', 'Age', ''];
      const headers = extractHeaders(rows, explicit);
      expect(headers).toEqual(['First Name', 'Age']);
    });

    test('extracts up to max sample values without nulls', () => {
      const rows = [
        { Name: 'Alice', Score: '' },
        { Name: 'Bob', Score: '95' },
        { Name: 'Charlie', Score: '80' },
        { Name: 'David', Score: '70' },
      ];
      const samples = extractSampleValues(rows, ['Name', 'Score'], 2);
      expect(samples.Name).toEqual(['Alice', 'Bob']);
      expect(samples.Score).toEqual(['95', '80']);
    });
  });

  describe('CSV Parser', () => {
    test('parses CSV from string with auto-detected headers', async () => {
      const csvStr = `First Name,Last Name,Email\nJohn,Doe,john@example.com\nJane,Smith,jane@example.com`;
      const result = await parseCsv(csvStr);

      expect(result.headers).toEqual(['First Name', 'Last Name', 'Email']);
      expect(result.rawCount).toBe(2);
      expect(result.rows[0]['First Name']).toBe('John');
      expect(result.rows[1]['Email']).toBe('jane@example.com');
    });

    test('parses CSV buffer with UTF-8 BOM', async () => {
      const csvStr = `\uFEFFName,Department\nAlice,Engineering\nBob,Design`;
      const buffer = Buffer.from(csvStr, 'utf-8');
      const result = await parseCsv(buffer);

      expect(result.headers).toEqual(['Name', 'Department']);
      expect(result.rawCount).toBe(2);
    });

    test('parses CSV from readable stream', async () => {
      const stream = Readable.from(['Product,Price\nLaptop,1200\nMouse,25\n']);
      const result = await parseCsv(stream);

      expect(result.headers).toEqual(['Product', 'Price']);
      expect(result.rawCount).toBe(2);
      expect(result.rows[0].Product).toBe('Laptop');
    });

    test('throws ParsingError on invalid input type', async () => {
      await expect(parseCsv(12345)).rejects.toThrow(ParsingError);
    });
  });

  describe('Excel Parser', () => {
    test('parses generated XLSX buffer', async () => {
      const wb = XLSX.utils.book_new();
      const wsData = [
        ['Customer', 'Total Amount', 'Status'],
        ['Acme Corp', 5000, 'Paid'],
        ['Globex', 3200, 'Pending'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const result = await parseExcel(buffer);
      expect(result.sheetName).toBe('Invoices');
      expect(result.headers).toEqual(['Customer', 'Total Amount', 'Status']);
      expect(result.rawCount).toBe(2);
      expect(result.rows[0].Customer).toBe('Acme Corp');
      expect(result.rows[0]['Total Amount']).toBe(5000);
    });

    test('throws ParsingError on corrupt buffer', async () => {
      const badBuffer = Buffer.from('not a zip or excel file at all');
      await expect(parseExcel(badBuffer)).rejects.toThrow(ParsingError);
    });
  });

  describe('Format Detection & Dispatcher', () => {
    test('detects format by filename and mimetype', () => {
      expect(detectFormat(null, 'text/csv', 'data.csv')).toBe('csv');
      expect(detectFormat(null, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('excel');
      expect(detectFormat(null, '', 'test.xlsx')).toBe('excel');
    });

    test('parseTabularData parses CSV buffer seamlessly', async () => {
      const buffer = Buffer.from('ID,Title\n1,Intro\n2,Outro');
      const result = await parseTabularData({ buffer, mimetype: 'text/csv' });
      expect(result.format).toBe('csv');
      expect(result.headers).toEqual(['ID', 'Title']);
      expect(result.rawCount).toBe(2);
      expect(result.sampleValues.ID).toEqual(['1', '2']);
    });
  });
});
