# bulk-d

> **Intelligent, AI-powered spreadsheet-to-database middleware for Node.js.**  
> Map unpredictable, user-uploaded CSV and Excel columns to strict database schemas without brittle templates or hallucination risks.

---

## Features

- **Multi-Format Parsing:** Effortlessly parse `.csv`, `.xlsx`, and `.xls` files from buffers or Node.js readable streams.
- **AI-Powered Mapping:** Automatically matches unpredictable client column headers to your strict database schema using LLM semantic reasoning.
- **Multi-Provider Support:** First-class support for **OpenAI**, **Anthropic**, **Google Gemini**, and **Custom OpenAI-compatible** endpoints (Groq, Ollama, OpenRouter).
- **Ultra-Lightweight & Fast:** Uses native Node.js `fetch` with exponential backoff and timeouts. Zero vendor SDK bloat.
- **Dual Schema Engine:** Define target schemas using standard JavaScript objects or native **Zod** (`z.object({...})`) schemas.
- **Automatic Type Casting:** Intelligently coerces strings into numbers (stripping currency symbols and commas), dates, booleans, and strings.
- **Row-Level Partitioning:** Clean separation of valid rows (`data`) and invalid rows (`errors`) with row numbers and failure reasons.
- **Two-Step UI Preview Support:** Extract headers and inspect AI mapping recommendations before committing transformations, ideal for UI review screens (e.g. Next.js + ShadCN UI).
- **Enterprise Security:** Built-in server runtime guards prevent accidental execution in client-side/browser bundles, protecting your API keys.

---

## Installation

```bash
npm install bulk-d
```

---

## Quickstart (One-Shot Import)

Process and transform an uploaded file in a single step:

```javascript
const BulkD = require('bulk-d');

// Initialize with your AI provider credentials
const mapper = new BulkD({
  provider: 'openai', // 'openai' | 'anthropic' | 'google' | 'custom'
  apiKey: process.env.OPENAI_API_KEY,
  strictness: 'high', // 'high' | 'medium' | 'low'
});

// Define your target database schema (Plain JS or Zod)
const targetSchema = {
  firstName: { type: 'string', required: true },
  lastName: { type: 'string', required: true },
  email: { type: 'string', required: true },
  salary: { type: 'number', required: false },
  joinedAt: { type: 'date', required: false },
};

async function handleFileUpload(fileBuffer, mimetype) {
  const result = await mapper.processFile({
    buffer: fileBuffer,
    mimetype: mimetype, // e.g. 'text/csv' or 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    schema: targetSchema,
  });

  console.log('AI Mapping:', result.mapping);
  // Example output: { "F_Name": "firstName", "L_Name": "lastName", "Work Email": "email" }

  console.log(`Successfully mapped ${result.stats.valid} rows.`);
  console.log(`Failed rows: ${result.stats.invalid}`);

  // Insert valid rows into your database
  await db.users.createMany({ data: result.data });

  // Return validation feedback to user
  return {
    success: true,
    data: result.data,
    errors: result.errors,
  };
}
```

---

## Two-Step Interactive UI Workflow

For applications with a column-mapping review screen (e.g., Next.js, ShadCN, React Table):

```javascript
// Step 1: In your /api/upload/preview route
const preview = await mapper.getMapping({
  buffer: uploadedFileBuffer,
  mimetype: 'text/csv',
  schema: targetSchema,
});

// Send back to client:
// {
//   headers: ["First Name", "Surname", "Annual Pay"],
//   mapping: { "First Name": "firstName", "Surname": "lastName", "Annual Pay": "salary" },
//   confidence: { "firstName": 0.98, "lastName": 0.95, "salary": 0.92 }
// }

// Step 2: In your /api/upload/confirm route (after user confirms/adjusts column mappings)
const transformed = await mapper.transform({
  buffer: uploadedFileBuffer,
  mimetype: 'text/csv',
  schema: targetSchema,
  mapping: confirmedMappingFromClient, // Use user-approved mapping
});

console.log(transformed.data); // Clean, type-casted rows ready for database
console.log(transformed.errors); // Any row-level validation errors
```

---

## Using with Zod Schemas

You can pass standard Zod schemas directly. `bulk-d` extracts field types and optionality for AI prompting, and runs `safeParse()` on every transformed row:

```javascript
const { z } = require('zod');
const BulkD = require('bulk-d');

const mapper = new BulkD({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const userZodSchema = z.object({
  fullName: z.string().min(2).describe('Full legal name'),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
  birthDate: z.date().optional(),
});

const result = await mapper.processFile({
  buffer: fileBuffer,
  mimetype: 'text/csv',
  schema: userZodSchema,
});
```

---

## Supported AI Providers

### 1. OpenAI
```javascript
const mapper = new BulkD({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini', // default: 'gpt-4o-mini'
});
```

### 2. Anthropic (Claude)
```javascript
const mapper = new BulkD({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-haiku-20241022', // default: 'claude-3-5-haiku-20241022'
});
```

### 3. Google Gemini
```javascript
const mapper = new BulkD({
  provider: 'google', // or 'gemini'
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-1.5-flash', // default: 'gemini-1.5-flash'
});
```

### 4. Custom / OpenAI-Compatible (Groq, Ollama, OpenRouter)
```javascript
const mapper = new BulkD({
  provider: 'custom',
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
  model: 'llama-3.3-70b-versatile',
});
```

---

## Error Handling

`bulk-d` exports a hierarchy of custom error classes so consumers can handle errors deterministically:

```javascript
const {
  BulkD,
  BulkDError,
  ParsingError,
  MappingError,
  ProviderError,
  ValidationError,
} = require('bulk-d');

try {
  const result = await mapper.processFile({ buffer, mimetype, schema });
} catch (err) {
  if (err instanceof ParsingError) {
    // Malformed CSV, corrupt Excel, or unsupported format
    console.error('File parsing failed:', err.message);
  } else if (err instanceof MappingError) {
    // AI failed to return valid mapping or missing required columns
    console.error('Mapping error:', err.message);
  } else if (err instanceof ProviderError) {
    // AI provider network failure, rate limit (429), or timeout
    console.error(`AI Provider error (${err.details.statusCode}):`, err.message);
  } else if (err instanceof ValidationError) {
    // Target schema was improperly configured
    console.error('Schema validation error:', err.message);
  } else if (err instanceof BulkDError) {
    // Any other bulk-d error
    console.error('BulkD error:', err.message);
  }
}
```

---

## API Reference

### `new BulkD(options)`
- `provider` (*string*, default `'openai'`): Provider identifier (`'openai'`, `'anthropic'`, `'google'`, `'custom'`).
- `apiKey` (*string*): API key for the chosen provider.
- `model` (*string*, optional): Specific model identifier override.
- `baseURL` (*string*, optional): Base URL for custom or self-hosted endpoints.
- `strictness` (*'low' | 'medium' | 'high'*, default `'high'`): AI tolerance when matching columns.
- `timeoutMs` (*number*, default `30000`): Request timeout in milliseconds.
- `maxRetries` (*number*, default `3`): Retry attempts with exponential backoff.

### `mapper.processFile(params)`
Executes the full pipeline: parsing, AI mapping, type casting, and row validation.
- **Parameters:**
  - `buffer` (*Buffer*, optional): Raw file buffer.
  - `stream` (*Readable*, optional): File stream.
  - `mimetype` (*string*, optional): MIME type (`'text/csv'`, `'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'`).
  - `filename` (*string*, optional): Filename used for extension detection (`data.csv`, `data.xlsx`).
  - `schema` (*object* | *ZodSchema*): Target schema definition.
  - `mapping` (*Record<string, string>*, optional): Explicit column mapping override (skips AI call if provided).
- **Returns:**
  - `data` (*Array<object>*): Array of valid, type-casted rows.
  - `errors` (*Array<{ row: number, errors: string[], raw: object }>*): Rows that failed validation.
  - `mapping` (*Record<string, string>*): Applied column mapping.
  - `unmapped` (*string[]*): Spreadsheet columns that were discarded.
  - `confidence` (*Record<string, number>*): AI confidence scores per mapped field.
  - `stats` (*{ total: number, valid: number, invalid: number }*): Summary counts.

### `mapper.getMapping(params)`
Extracts headers and generates AI column mapping without transforming rows.

### `mapper.transform(params)`
Transforms rows against a confirmed column mapping without querying AI.

---

## License

ISC © [Oluwajuwon Kayode (godfella)](https://github.com/godfella)
