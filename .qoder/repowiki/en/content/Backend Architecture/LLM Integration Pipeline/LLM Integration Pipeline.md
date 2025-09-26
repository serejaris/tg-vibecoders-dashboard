# LLM Integration Pipeline

<cite>
**Referenced Files in This Document**   
- [lib/llm/report.ts](file://lib/llm/report.ts)
- [lib/report/digest_schema.ts](file://lib/report/digest_schema.ts)
- [lib/report/digest_render.ts](file://lib/report/digest_render.ts)
- [lib/llm/shared.ts](file://lib/llm/shared.ts)
- [lib/report/slice.ts](file://lib/report/slice.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Core Components](#core-components)
3. [Architecture Overview](#architecture-overview)
4. [Detailed Component Analysis](#detailed-component-analysis)
5. [Error Handling Strategies](#error-handling-strategies)
6. [Security and Configuration](#security-and-configuration)
7. [Conclusion](#conclusion)

## Introduction

The LLM integration pipeline in the tg-vibecoders-dashboard orchestrates the generation of structured daily digest reports through a robust sequence of data preparation, model interaction, validation, and rendering. At its core, the `generateReportFromPreview` function coordinates this workflow by leveraging OpenAI's Responses API with strict JSON schema enforcement via `DailyDigestJsonSchemaForLLM`. This document details the end-to-end flow from preview construction to final markdown output, emphasizing reliability, predictability, and developer safety.

**Section sources**
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)
- [lib/report/slice.ts](file://lib/report/slice.ts#L100-L344)

## Core Components

The pipeline consists of several key functions that handle distinct responsibilities: `buildDailyPreview` prepares input data, `buildDigestUserPrompt` constructs the prompt, `generateReportFromPreview` manages the API interaction, and `renderDigest` produces the final human-readable output. These components work together to ensure consistent, validated results while handling common failure modes gracefully.

**Section sources**
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)
- [lib/report/slice.ts](file://lib/report/slice.ts#L100-L344)
- [lib/llm/shared.ts](file://lib/llm/shared.ts#L65-L77)
- [lib/report/digest_render.ts](file://lib/report/digest_render.ts#L2-L32)

## Architecture Overview

```mermaid
flowchart TD
A[Start] --> B[buildDailyPreview]
B --> C[buildDigestUserPrompt]
C --> D[generateReportFromPreview]
D --> E[OpenAI API Call]
E --> F[Parse Response]
F --> G[Validate Against Zod Schema]
G --> H{Validation Success?}
H --> |Yes| I[renderDigest]
H --> |No| J[Throw Schema Error]
I --> K[Return Markdown & JSON]
J --> L[Handle Error]
E --> M{Timeout?}
M --> |Yes| N[Throw Timeout Error]
M --> |No| F
F --> O{Empty Content?}
O --> |Yes| P[Throw Empty Content Error]
O --> |No| G
```

**Diagram sources**
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)
- [lib/report/slice.ts](file://lib/report/slice.ts#L100-L344)

## Detailed Component Analysis

### Report Generation Workflow

The `generateReportFromPreview` function serves as the orchestration point for the entire LLM pipeline. It begins by validating environment configuration (API key and model), then proceeds through a time-limited execution window to prevent hanging operations.

#### Prompt Construction and API Execution
```mermaid
sequenceDiagram
participant Client as "API Handler"
participant Generator as "generateReportFromPreview"
participant OpenAI as "OpenAI API"
participant Renderer as "renderDigest"
Client->>Generator : Call with args.preview
Generator->>Generator : Validate env vars
Generator->>Generator : Set timeout deadline
Generator->>Generator : buildDigestUserPrompt()
Generator->>OpenAI : POST /responses/create
OpenAI-->>Generator : Streaming response
Generator->>Generator : Race with timeout
alt Timeout
Generator->>Generator : Reject with 'openai_timeout'
else Success
Generator->>Generator : Extract output_text
Generator->>Generator : JSON.parse(content)
Generator->>Generator : Validate with DailyDigestSchema
alt Valid
Generator->>Renderer : renderDigest(validated.data)
Renderer-->>Generator : Return markdown
Generator-->>Client : {json, markdown}
else Invalid
Generator->>Generator : Format validation issues
Generator->>Client : Throw schema error
end
end
```

**Diagram sources**
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)
- [lib/llm/shared.ts](file://lib/llm/shared.ts#L65-L77)
- [lib/report/digest_render.ts](file://lib/report/digest_render.ts#L2-L32)

#### Data Flow and Validation
```mermaid
flowchart LR
Preview[ReportPreview] --> PromptBuilder[buildDigestUserPrompt]
PromptBuilder --> JSONStr[JSON.stringify(payload)]
JSONStr --> UserPrompt[Formatted User Prompt]
UserPrompt --> APIRequest[OpenAI Request Body]
APIRequest --> OpenAI[OpenAI Responses API]
OpenAI --> RawText[Raw output_text]
RawText --> JSONParse[JSON.parse()]
JSONParse --> ParsedObject[Parsed JSON Object]
ParsedObject --> ZodValidator[DailyDigestSchema.safeParse]
ZodValidator --> Validated[Validated DailyDigest]
Validated --> Render[renderDigest]
Render --> FinalMarkdown[Final Markdown Output]
```

**Diagram sources**
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)
- [lib/report/digest_schema.ts](file://lib/report/digest_schema.ts#L11-L23)
- [lib/report/digest_render.ts](file://lib/report/digest_render.ts#L2-L32)

### Schema Validation System

The pipeline employs a dual-schema approach for maximum reliability. The `DailyDigestJsonSchemaForLLM` enforces strict output format at the API level, while `DailyDigestSchema` provides runtime type checking using Zod.

```mermaid
classDiagram
class DailyDigestJsonSchemaForLLM {
+type : object
+additionalProperties : false
+required : string[]
+properties : object
}
class DailyDigestSchema {
+discussions : z.array(DiscussionItemSchema)
+resources : z.array(z.string())
+unanswered_questions : z.array(z.string())
+stats : z.object({messages_count, participants_count})
+insights : z.array(z.string()).optional()
}
class DiscussionItemSchema {
+topic : z.string()
+question : z.string()
+participants : z.array(z.string())
+outcome : z.string()
}
DailyDigestSchema --> DiscussionItemSchema : "contains"
DailyDigestJsonSchemaForLLM ..> DailyDigestSchema : "mirrors structure"
```

**Diagram sources**
- [lib/report/digest_schema.ts](file://lib/report/digest_schema.ts#L11-L63)

**Section sources**
- [lib/report/digest_schema.ts](file://lib/report/digest_schema.ts#L11-L63)

## Error Handling Strategies

The pipeline implements comprehensive error handling for various failure modes, each with appropriate context preservation for debugging.

```mermaid
stateDiagram-v2
[*] --> Processing
Processing --> Timeout : "Promise.race rejects"
Processing --> EmptyContent : "output_text empty"
Processing --> ParseError : "JSON.parse fails"
Processing --> SchemaInvalid : "Zod validation fails"
Processing --> Success : "All checks pass"
Timeout --> HandleError : "Error('openai_timeout')"
EmptyContent --> HandleError : "Error('openai_empty_content')"
ParseError --> HandleError : "Error('invalid_json_from_model')"
SchemaInvalid --> HandleError : "Error('json_schema_validation_failed')"
Success --> FinalOutput
classDef error fill : #f8b7bd,stroke : #333;
class Timeout,EmptyContent,ParseError,SchemaInvalid,HandleError error
```

**Diagram sources**
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)

**Section sources**
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)

## Security and Configuration

The system maintains security through environment-controlled configuration. API keys and model selection are sourced exclusively from environment variables, preventing hardcoding risks. Additional parameters like `MAX_OUTPUT_TOKENS` and `EFFECTIVE_TIMEOUT` are also configurable through environment settings, allowing operational tuning without code changes.

**Section sources**
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)