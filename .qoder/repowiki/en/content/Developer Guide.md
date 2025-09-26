# Developer Guide

<cite>
**Referenced Files in This Document**   
- [package.json](file://package.json)
- [README.md](file://README.md)
- [scripts/smoke-openai.mjs](file://scripts/smoke-openai.mjs)
- [scripts/smoke-digest.mjs](file://scripts/smoke-digest.mjs)
- [lib/llm/README.md](file://lib/llm/README.md)
- [lib/llm/report.ts](file://lib/llm/report.ts)
- [lib/report/digest_schema.ts](file://lib/report/digest_schema.ts)
- [app/api/report/generate/route.ts](file://app/api/report/generate/route.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Setup Instructions](#setup-instructions)
3. [Available Scripts](#available-scripts)
4. [Running Smoke Tests](#running-smoke-tests)
5. [Debugging Tips](#debugging-tips)
6. [Contribution Guidelines](#contribution-guidelines)
7. [Performance Testing and Feature Extension](#performance-testing-and-feature-extension)
8. [Conclusion](#conclusion)

## Introduction
This guide provides a comprehensive overview for developers contributing to the `tg-vibecoders-dashboard` project. It covers setup, testing, debugging, and contribution practices to ensure consistency and lower the barrier to entry for new contributors.

## Setup Instructions
To get started with the project:
1. Ensure **Node.js 18+** is installed.
2. Copy `.env.example` to `.env`:  
   ```bash
   cp .env.example .env
   ```
3. Fill in required environment variables such as `DATABASE_URL`, `OPENAI_API_KEY`, and `OPENAI_MODEL`.
4. Install dependencies:  
   ```bash
   npm i
   ```
5. Start the development server:  
   ```bash
   npm run dev
   ```

After starting, access the dashboard at:
- **24-hour view**: http://localhost:3000
- **7-day view**: http://localhost:3000/week

**Section sources**
- [README.md](file://README.md#L0-L81)
- [package.json](file://package.json#L0-L41)

## Available Scripts
The following scripts are defined in `package.json`:

| Script | Purpose |
|-------|--------|
| `dev` | Starts the Next.js development server (`next dev`) |
| `build` | Builds the production application (`next build`) |
| `start` | Starts the production server (`next start`) |
| `smoke:openai` | Validates OpenAI API connectivity and JSON schema compliance |
| `smoke:digest` | Tests the `DAILY_DIGEST_SCHEMA` integrity using minimal input |

Additional utility scripts include:
- `dev:clean`: Cleans build artifacts before starting dev server
- `dev:turbo`: Uses Turbo mode for faster development startup

These scripts streamline development, testing, and deployment workflows.

**Section sources**
- [package.json](file://package.json#L0-L41)

## Running Smoke Tests
Smoke tests verify core functionality and integration points.

### OpenAI Connectivity Test
Run the OpenAI smoke test to confirm API access and structured output:
```bash
npm run smoke:openai
```
This script:
- Uses `OPENAI_API_KEY` and `OPENAI_MODEL` from `.env`
- Requests a strict JSON response via OpenAI's Responses API
- Validates that output matches expected schema
- Outputs success or error details including request ID

It ensures the LLM pipeline can generate valid structured outputs.

**Diagram sources**
- [scripts/smoke-openai.mjs](file://scripts/smoke-openai.mjs#L0-L102)

### Digest Schema Validation Test
Verify the daily digest schema with:
```bash
npm run smoke:digest
```
This test:
- Submits a minimal message set to OpenAI
- Enforces compliance with `DAILY_DIGEST_SCHEMA`
- Checks that all required fields (`discussions`, `resources`, `stats`, etc.) are present
- Confirms JSON parsing and schema validation logic

Passing this test indicates the report generation pipeline is intact.

**Diagram sources**
- [scripts/smoke-digest.mjs](file://scripts/smoke-digest.mjs#L0-L116)
- [lib/report/digest_schema.ts](file://lib/report/digest_schema.ts#L0-L66)

## Debugging Tips
Effective debugging strategies include:

### Console Logging in API Routes
Use `console.log` within API routes (e.g., `/api/report/generate/route.ts`) to inspect:
- Input parameters (`date`, `chat_id`)
- Generated preview data
- Error objects and request IDs

Example:
```ts
console.log('Preview generated:', preview);
```

Ensure logs are removed before committing.

**Section sources**
- [app/api/report/generate/route.ts](file://app/api/report/generate/route.ts#L0-L51)

### Inspecting Network Requests
Use browser DevTools to:
- Monitor API calls under **Network** tab
- Check request payloads and response bodies
- Identify failed requests (4xx/5xx) and their error messages
- Capture `_request_id` for troubleshooting OpenAI issues

### Validating SQL Queries
When modifying data-fetching logic:
- Log raw SQL queries if possible
- Test them directly in your Postgres client
- Confirm they return expected shape and types
- Validate time window filtering (`sent_at`) and joins

Also refer to the database schema notes in `README.md`.

**Section sources**
- [README.md](file://README.md#L0-L81)

## Contribution Guidelines
Follow these standards when contributing.

### Code Style
- Use **TypeScript** with strict typing
- Follow **React** conventions (functional components, hooks)
- Adhere to existing formatting and naming patterns
- Import OpenAI only dynamically on server-side

Pin Node runtime in API routes:
```ts
export const runtime = 'nodejs';
```

**Section sources**
- [lib/llm/README.md](file://lib/llm/README.md#L0-L95)
- [app/api/report/generate/route.ts](file://app/api/report/generate/route.ts#L0-L51)

### Branch Workflow
1. Create a feature branch from `main`
2. Commit changes with clear, descriptive messages
3. Push and open a Pull Request (PR)

### Pull Request Expectations
- Include a summary of changes
- Reference related issues if applicable
- Update documentation if needed
- Ensure all smoke tests pass
- Avoid large diffs; split into logical chunks

## Performance Testing and Feature Extension
Consider performance implications when extending features.

### Performance Testing Advice
- Monitor API response times under load
- Use `REPORT_TIMEOUT_MS` and `REPORT_MAX_OUTPUT_TOKENS` to control LLM call duration and size
- Trim large message arrays before sending to OpenAI:
  ```ts
  function trimArrayTail<T>(arr: T[], max = 400): T[] {
    return arr.slice(-max);
  }
  ```
- Prefer small inputs to avoid 400/413 errors

**Section sources**
- [lib/llm/README.md](file://lib/llm/README.md#L74-L95)
- [lib/llm/report.ts](file://lib/llm/report.ts#L0-L147)

### Extending Features
To add new tables or charts:
1. Create a new component in `app/components/tables/` or `app/components/charts/`
2. Use existing patterns (e.g., `TopWordsTable.tsx`, `DailyChart.tsx`)
3. Connect via API route if backend data is needed
4. Validate schema alignment when integrating with LLM outputs
5. Add corresponding smoke or unit tests

For example, adding a new chart involves:
- Building a reusable React component
- Fetching data via an API endpoint
- Ensuring responsive design with Tailwind CSS

Always validate that new features do not degrade LLM response reliability.

**Section sources**
- [app/components/tables/TopWordsTable.tsx](file://app/components/tables/TopWordsTable.tsx)
- [app/components/charts/DailyChart.tsx](file://app/components/charts/DailyChart.tsx)

## Conclusion
This guide equips developers with essential knowledge to contribute effectively to `tg-vibecoders-dashboard`. By following setup instructions, running smoke tests, applying debugging techniques, and adhering to contribution standards, team members can maintain high code quality and system reliability. The integration of OpenAI for structured output requires careful schema management and testing—practices emphasized throughout this document.