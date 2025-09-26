# LLM Integration

<cite>
**Referenced Files in This Document**   
- [app/api/report/generate/route.ts](file://app/api/report/generate/route.ts)
- [lib/llm/report.ts](file://lib/llm/report.ts)
- [lib/report/digest_schema.ts](file://lib/report/digest_schema.ts)
- [lib/llm/shared.ts](file://lib/llm/shared.ts)
- [lib/report/digest_render.ts](file://lib/report/digest_render.ts)
- [scripts/smoke-openai.mjs](file://scripts/smoke-openai.mjs)
- [scripts/smoke-digest.mjs](file://scripts/smoke-digest.mjs)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Process Flow Overview](#process-flow-overview)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Prompt Engineering Techniques](#prompt-engineering-techniques)
7. [Error Handling and Recovery](#error-handling-and-recovery)
8. [Performance and Cost Considerations](#performance-and-cost-considerations)
9. [Testing Strategy](#testing-strategy)
10. [Conclusion](#conclusion)

## Introduction
The tg-vibecoders-dashboard application integrates with OpenAI's Responses API to generate structured daily digests from raw chat logs. This system transforms unstructured message data into actionable insights through a carefully orchestrated pipeline involving prompt engineering, schema enforcement, and robust error handling. The integration ensures deterministic JSON output for reliable downstream processing and UI rendering.

## Process Flow Overview
The LLM integration follows a multi-stage process:
1. Message fetching and preprocessing via `buildDailyPreview`
2. Prompt construction with context and instructions
3. API call to OpenAI Responses endpoint with strict JSON schema
4. Response validation using Zod schema
5. Markdown rendering for UI presentation

```mermaid
flowchart TD
A[Fetch Messages] --> B[Build Preview]
B --> C[Construct Prompt]
C --> D[Call OpenAI API]
D --> E[Parse JSON Response]
E --> F[Validate Schema]
F --> G[Render Markdown]
G --> H[Return Result]
```

**Diagram sources**
- [app/api/report/generate/route.ts](file://app/api/report/generate/route.ts#L1-L52)
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)

## Core Components
The system consists of several key components working together to produce structured digests. These include the route handler, report generator, schema validator, and rendering engine.

**Section sources**
- [app/api/report/generate/route.ts](file://app/api/report/generate/route.ts#L1-L52)
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)

## Architecture Overview
The architecture separates concerns between data retrieval, LLM interaction, and output formatting. The system uses environment variables for configuration and implements timeout handling to prevent hanging requests.

```mermaid
graph TB
subgraph "API Layer"
Route[Generate Route Handler]
end
subgraph "LLM Service"
Report[Report Generator]
Shared[Shared Utilities]
Schema[Digest Schema]
Render[Digest Renderer]
end
subgraph "External Services"
OpenAI[OpenAI API]
Database[PostgreSQL]
end
Route --> Report
Report --> Shared
Report --> Schema
Report --> Render
Report --> OpenAI
Route --> Database
```

**Diagram sources**
- [app/api/report/generate/route.ts](file://app/api/report/generate/route.ts#L1-L52)
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)
- [lib/report/digest_schema.ts](file://lib/report/digest_schema.ts#L11-L23)

## Detailed Component Analysis

### Report Generation Pipeline
The core functionality resides in the `generateReportFromPreview` function, which orchestrates the entire digest generation process.

#### Function Call Flow
```mermaid
sequenceDiagram
participant Client as "API Client"
participant Route as "Route Handler"
participant Generator as "generateReportFromPreview"
participant OpenAI as "OpenAI API"
Client->>Route : GET /api/report/generate?date=...
Route->>Generator : generateReportFromPreview(args)
Generator->>OpenAI : POST responses.create
OpenAI-->>Generator : Response object
Generator->>Generator : Parse JSON content
Generator->>Generator : Validate against Zod schema
Generator->>Generator : Render to Markdown
Generator-->>Route : {json, markdown}
Route-->>Client : JSON response
```

**Diagram sources**
- [app/api/report/generate/route.ts](file://app/api/report/generate/route.ts#L1-L52)
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)

### Schema Validation System
The system employs dual-layer schema validation using both OpenAI's strict JSON schema and Zod runtime validation.

#### Schema Enforcement Flow
```mermaid
flowchart TD
A[OpenAI Request] --> B{Strict JSON Schema}
B --> |Enforced by API| C[Model Output]
C --> D{Valid JSON?}
D --> |No| E[Throw parse error]
D --> |Yes| F[Zod Validation]
F --> |Invalid| G[Throw schema error]
F --> |Valid| H[Proceed to render]
```

**Diagram sources**
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)
- [lib/report/digest_schema.ts](file://lib/report/digest_schema.ts#L11-L23)

## Prompt Engineering Techniques
The system uses carefully crafted prompts to guide model behavior and ensure consistent output format.

### System Prompts
The `SYSTEM_PROMPT` directive establishes clear expectations for the model:

- Requires exactly one JSON object output
- Specifies field-by-field requirements
- Enforces factual reporting from input messages only
- Prohibits markdown wrapping
- Defines participant formatting rules

```typescript
// Example prompt structure
const SYSTEM_PROMPT = `You are a daily digest editor... Return exactly one JSON object without markdown...`;
```

**Section sources**
- [lib/llm/shared.ts](file://lib/llm/shared.ts#L3-L21)

### Input Trimming Strategy
To manage token usage and focus on relevant content, the system implements intelligent preview trimming:

- Filters out empty messages
- Limits message history to last 400 (reduced to 250 if token threshold exceeded)
- Preserves essential metadata like time window

```mermaid
flowchart LR
A[Full Preview] --> B{Has Messages?}
B --> |No| C[Return Original]
B --> |Yes| D[Filter Non-empty]
D --> E[Take Last 400]
E --> F{Tokens > 18k?}
F --> |Yes| G[Take Last 250]
F --> |No| H[Use 400]
H --> I[Return Trimmed]
G --> I
```

**Diagram sources**
- [lib/llm/shared.ts](file://lib/llm/shared.ts#L32-L45)

## Error Handling and Recovery
The system implements comprehensive error handling at multiple levels to ensure reliability.

### Error Types and Handling
```mermaid
stateDiagram-v2
[*] --> Success
[*] --> Failure
Failure --> missing_openai_key : Env check
Failure --> openai_timeout : Promise.race
Failure --> openai_empty_content : Empty response
Failure --> invalid_json_from_model : JSON.parse fail
Failure --> json_schema_validation_failed : Zod validation
missing_openai_key --> HTTP_503
openai_timeout --> HTTP_504
openai_empty_content --> HTTP_502
invalid_json_from_model --> HTTP_422
json_schema_validation_failed --> HTTP_422
Success --> HTTP_200
```

**Diagram sources**
- [app/api/report/generate/route.ts](file://app/api/report/generate/route.ts#L1-L52)
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)

## Performance and Cost Considerations
The system balances performance, cost, and reliability through several mechanisms.

### Configuration Options
The following environment variables control performance characteristics:

- `OPENAI_API_KEY`: Authentication credential
- `OPENAI_MODEL`: Target model identifier
- `REPORT_MAX_OUTPUT_TOKENS`: Maximum response size
- `REPORT_TIMEOUT_MS`: Request deadline in milliseconds

These settings allow tuning based on cost/performance requirements and expected load patterns.

**Section sources**
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)

## Testing Strategy
The system includes dedicated smoke tests to verify critical functionality.

### Smoke Test Components
Two primary test scripts validate different aspects of the integration:

#### OpenAI Connectivity Test
Verifies basic API connectivity and JSON schema compliance with a minimal payload.

```mermaid
flowchart TD
A[Initialize Client] --> B[Create Response]
B --> C{Status Complete?}
C --> |No| D[Poll Until Timeout]
C --> |Yes| E[Extract Text]
E --> F{Has Content?}
F --> |No| G[Fail: Empty Output]
F --> |Yes| H[Parse JSON]
H --> I{Valid Shape?}
I --> |No| J[Fail: Mismatch]
I --> |Yes| K[Pass: Success]
```

**Diagram sources**
- [scripts/smoke-openai.mjs](file://scripts/smoke-openai.mjs#L1-L103)

#### Digest Schema Compliance Test
Validates that the model can produce output matching the production digest schema.

**Section sources**
- [scripts/smoke-digest.mjs](file://scripts/smoke-digest.mjs#L1-L117)

## Conclusion
The LLM integration in tg-vibecoders-dashboard demonstrates a robust approach to generating structured insights from unstructured chat data. By combining strict schema enforcement, thoughtful prompt engineering, and comprehensive error handling, the system delivers reliable results suitable for production use. Developers can extend this foundation by customizing prompts, adding new features, or switching models while maintaining the integrity of the output format.