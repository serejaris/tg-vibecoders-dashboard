
# Error Handling Strategy

<cite>
**Referenced Files in This Document**
- [app/api/report/generate/route.ts](file://app/api/report/generate/route.ts)
- [app/api/report/insights/route.ts](file://app/api/report/insights/route.ts)
- [app/api/report/preview/route.ts](file://app/api/report/preview/route.ts)
- [app/api/overview/route.ts](file://app/api/overview/route.ts)
- [lib/llm/report.ts](file://lib/llm/report.ts)
- [lib/report/slice.ts](file://lib/report/slice.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Core Error Types and HTTP Status Mapping](#core-error-types-and-http-status-mapping)
3. [API Route Error Wrapping Strategy](#api-route-error-wrapping-strategy)
4. [LLM Service Error Handling](#llm-service-error-handling)
5. [Request ID Propagation and Debugging](#request-id-propagation-and-debugging)
6. [Logging Practices and Error Enrichment](#logging-practices-and-error-enrichment)
7. [Extending Error Handling for New Endpoints](#extending-error-handling-for-new-endpoints)

## Introduction
The tg-vibecoders-dashboard backend implements a comprehensive error handling strategy across its API routes and LLM services. The system employs defensive programming patterns to handle various failure modes including configuration issues, input validation errors, database connectivity problems, and external API failures. Errors are wrapped in try-catch blocks at critical operation boundaries and transformed into standardized JSON payloads with appropriate HTTP status codes. This document analyzes the error handling implementation, focusing on how different error types are detected, categorized, and communicated to clients while maintaining consistency across the codebase.

## Core Error Types and HTTP Status Mapping
The system categorizes errors into distinct types and maps them to appropriate HTTP status codes following REST conventions:

```mermaid
flowchart TD
A[Error Type] --> B[HTTP 400 Bad Request]
A --> C[HTTP 422 Unprocessable Entity]
A --> D[HTTP 500 Internal Server Error]
A --> E[HTTP 503 Service Unavailable]
A --> F[HTTP 504 Gateway Timeout]
B --> B1["Missing required parameters (e.g., 'missing_date')"]
B --> B2["Invalid parameter format (e.g., 'invalid_date')"]
C --> C1["JSON schema validation failures"]
C --> C2["Invalid JSON from model"]
C --> C3["Empty output text from model"]
D --> D1["Internal server errors"]
D --> D2["Database query failures"]
D --> D3["Unexpected exceptions"]
E --> E1["Missing environment variables (DATABASE_URL)"]
E --> E2["Missing OpenAI API key"]
F --> F1["OpenAI API timeouts (AbortError)"]
```

**Diagram sources**
- [app/api/report/generate/route.ts](file://app/api/report/generate/route.ts#L7-L9)
- [app/api/report/insights/route.ts](file://app/api/report/insights/route.ts#L7-L9)
- [lib/llm/report.ts](file://lib/llm/report.ts#L33-L58)

**Section sources**
- [app/api/report/generate/route.ts](file://app/api/report/generate/route.ts#L7-L51)
- [app/api/report/insights/route.ts](file://app/api/report/insights/route.ts#L7-L52)
- [app/api/overview/route.ts](file://app/api/overview/route.ts#L0-L522)

## API Route Error Wrapping Strategy
API routes implement a consistent error wrapping pattern using try-catch blocks around critical operations. Each route defines a `badRequest` helper function that returns standardized 400 responses for client-side input errors:

```mermaid
sequenceDiagram
participant Client
participant Route as API Route Handler
participant Service as Backend Service
participant DB as Database
Client->>Route : HTTP Request
Route->>Route : Validate input parameters
alt Valid input
Route->>Service : Call service function
Service->>DB : Database operation
DB-->>Service : Result
Service-->>Route : Success response
Route-->>Client : 200 OK with data
else Invalid input
Route-->>Client : 400 Bad Request
end
Route->>Route : Wrap critical operations in try-catch
alt Exception occurs
Route->>Route : Extract request ID from error
Route->>Route : Map error to appropriate status code
Route-->>Client : Standardized error payload
end
```

The error handling logic in API routes specifically checks for:
- Missing or invalid date parameters (400)
- Missing OPENAI_API_KEY environment variable (503)
- AbortError from OpenAI operations (504)
- Other internal errors (500)

**Diagram sources**
- [app/api/report/generate/route.ts](file://app/api/report/generate/route.ts#L7-L51)
- [app/api/report/insights/route.ts](file://app/api/report/insights/route.ts#L7-L52)

**Section sources**
- [app/api/report/generate/route.ts](file://app/api/report/generate/route.ts#L7-L51)
- [app/api/report/insights/route.ts](file://app/api/report/insights/route.ts#L7-L52)

## LLM Service Error Handling
The LLM service layer implements sophisticated error handling for OpenAI API interactions, addressing multiple potential failure points:

```mermaid
flowchart TD
Start([Start LLM Request]) --> CheckEnv["Validate Environment Variables"]
CheckEnv --> EnvValid{"API Key & Model<br>Available?"}
EnvValid --> |No| ThrowKeyError["Throw 'missing_openai_key'"]
EnvValid --> |Yes| CreateRequest["Create OpenAI Response"]
CreateRequest --> Race["Race Promise:<br>Operation vs Timeout"]
Race --> Timeout{"Deadline<br>Exceeded?"}
Timeout --> |Yes| ThrowTimeout["Throw 'openai_timeout'"]
Timeout --> |No| GetResponse["Get SDK Response"]
GetResponse --> HasContent{"Has output_text<br>or structured content?"}
HasContent --> |No| ExtractContent["Extract from output array"]
ExtractContent --> StillEmpty{"Still no content?"}
StillEmpty --> |Yes| ThrowEmpty["Throw 'openai_empty_content'"]
HasContent --> |Yes| ParseJSON["Parse JSON Content"]
ParseJSON --> ParseSuccess{"Parse Successful?"}
ParseSuccess --> |No| ThrowParseError["Throw 'invalid_json_from_model'"]
ParseSuccess --> |Yes| ValidateSchema["Validate against Zod Schema"]
ValidateSchema --> SchemaValid{"Schema Valid?"}
SchemaValid --> |No| ThrowSchemaError["Throw 'json_schema_validation_failed'"]
SchemaValid --> |Yes| ReturnSuccess["Return processed result"]
ThrowKeyError --> End
ThrowTimeout --> End
ThrowEmpty --> End
ThrowParseError --> End
ThrowSchemaError --> End
ReturnSuccess --> End([Function Exit])
```

The LLM functions handle specific error conditions:
- Missing OPENAI_API_KEY or OPENAI_MODEL environment variables
- OpenAI API timeouts using Promise.race with deadline enforcement
- Empty or missing content in OpenAI responses
- Invalid JSON parsing from model output
- JSON schema validation failures using Zod

**Diagram sources**
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L96)
- [lib/llm/report.ts](file://lib/llm/report.ts#L98-L144)

**Section sources**
- [lib/llm/report.ts](file://lib/llm/report.ts#L16-L144)

## Request ID Propagation and Debugging
The system captures and propagates request IDs throughout the error handling chain to facilitate debugging and tracing:

```mermaid
sequenceDiagram
participant Client
participant Route
participant LLMService
participant OpenAI
Client->>Route : Request with x-request-id header
Route->>LLMService : Call generateReportFromPreview()
LLMService->>OpenAI : OpenAI API call
OpenAI-->>LLMService : Response with _request_id
alt Error occurs
LLMService->>LLMService : Attach requestId to Error object
LLMService-->>Route : Throw error with requestId
Route->>Route : Extract requestId from error properties
Route-->>Client : Error response with request_id
end
```

Request IDs are extracted from multiple possible sources in the error object:
- `e.requestId`
- `e._request_id`
- `e.headers.get('x-request-id')`

When an error occurs in the LLM service, the request ID from the OpenAI response is attached to the thrown error object, ensuring it flows back through the call stack to the API route, which includes it in the final error response to the client.

**Diagram sources**
- [app/api/report/generate/route.ts](file://app/api/report/generate/route.ts#L40-L50)
- [lib/llm/report.ts](file://lib/llm/report.ts#L70-L75)

**Section sources**
- [app/api/report/generate/route.ts](file://app/api/report/g