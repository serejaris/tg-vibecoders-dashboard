# Switch OpenAI to OpenRouter Integration

## Overview

This design outlines the migration strategy from OpenAI's direct API integration to OpenRouter service for the Telegram dashboard's LLM-powered report generation system. OpenRouter serves as a unified gateway that provides access to multiple AI models through a single API interface, offering better cost optimization and competitive pricing.

The current system uses OpenAI's Responses API with structured JSON schema validation for generating daily digests and insights from Telegram chat data. The migration will maintain existing functionality while leveraging OpenRouter's cost advantages.

## Architecture

### Current System Architecture

```mermaid
graph TB
    subgraph "Current OpenAI Integration"
        A[Dashboard API] --> B[LLM Service Layer]
        B --> C[OpenAI SDK]
        C --> D[OpenAI Responses API]
        D --> E[OpenAI GPT Models]
    end
    
    subgraph "Configuration"
        F[OPENAI_API_KEY]
        G[OPENAI_MODEL]
        H[REPORT_TIMEOUT_MS]
        I[REPORT_MAX_OUTPUT_TOKENS]
    end
    
    F --> C
    G --> C
    H --> B
    I --> C
```

### Target OpenRouter Architecture

```mermaid
graph TB
    subgraph "New OpenRouter Integration"
        A[Dashboard API] --> B[LLM Service Layer]
        B --> C[OpenRouter Client]
        C --> D[OpenRouter Gateway API]
        D --> E[AI Providers]
    end
    
    subgraph "Updated Configuration"
        J[OPENROUTER_API_KEY]
        K[OPENROUTER_MODEL]
        L[REPORT_TIMEOUT_MS]
        M[REPORT_MAX_OUTPUT_TOKENS]
        N[OPENROUTER_BASE_URL]
    end
    
    J --> C
    K --> C
    L --> B
    M --> C
    N --> C
```

## Migration Strategy

### Direct OpenRouter Integration

Complete replacement of OpenAI with OpenRouter, updating all configuration and implementation to use the new provider exclusively.

```mermaid
sequenceDiagram
    participant API as "Report API"
    participant Service as "LLM Service"
    participant Client as "OpenRouter Client"
    participant OpenRouter as "OpenRouter API"
    
    API->>Service: generateReportFromPreview()
    Service->>Service: validateOpenRouterConfig()
    Service->>Client: createOpenRouterClient()
    Client->>OpenRouter: OpenRouter API Call
    OpenRouter-->>Client: Response
    Client-->>Service: Processed Response
    Service->>Service: validateSchema()
    Service-->>API: Formatted Result
```

#### Environment Configuration Changes
Replace OpenAI configuration with OpenRouter equivalents:

| Old Configuration Variable | New Configuration Variable | Purpose |
|---------------------------|---------------------------|----------|
| `OPENAI_API_KEY` | `OPENROUTER_API_KEY` | Authentication credential |
| `OPENAI_MODEL` | `OPENROUTER_MODEL` | Model identifier |
| - | `OPENROUTER_BASE_URL` | API endpoint (optional, defaults to api.openrouter.ai) |
| `REPORT_TIMEOUT_MS` | `REPORT_TIMEOUT_MS` | Request timeout (unchanged) |
| `REPORT_MAX_OUTPUT_TOKENS` | `REPORT_MAX_OUTPUT_TOKENS` | Output token limit (unchanged) |

### OpenRouter Integration Implementation

#### Request Format Adaptation
OpenRouter uses OpenAI-compatible API format:

```mermaid
flowchart TD
    A[Original Request] --> B[OpenRouter Request Builder]
    B --> C[Add OpenRouter Headers]
    B --> D[Configure Model Parameters]
    C --> E[Execute Request]
    D --> E
    E --> F[Response Processing]
```

#### Response Processing
Ensure response format compatibility with existing system:

```mermaid
sequenceDiagram
    participant Client as "OpenRouter Client"
    participant OpenRouter as "OpenRouter API"
    participant Processor as "Response Processor"
    participant Validator as "Schema Validator"
    
    Client->>OpenRouter: POST /chat/completions
    OpenRouter-->>Client: Provider Response
    Client->>Processor: normalizeResponse()
    Processor->>Processor: extractContent()
    Processor->>Processor: extractMetadata()
    Processor->>Validator: validateStructure()
    Validator-->>Processor: Validation Result
    Processor-->>Client: Normalized Response
```

### Cost Optimization
Leverage OpenRouter's competitive pricing:

| Feature | Implementation | Benefit |
|---------|---------------|----------|
| Flexible Model Selection | Easy model switching via config | Cost reduction |
| Request Optimization | Optimize prompt length and parameters | Token usage optimization |
| Usage Monitoring | Track token consumption and costs | Cost transparency |

## Technical Implementation Details

### Client Configuration Interface

Simplified OpenRouter-only client configuration:

```mermaid
classDiagram
    class OpenRouterConfig {
        +apiKey: string
        +model: string
        +baseUrl: string
        +timeout: number
        +maxTokens?: number
    }
    
    class OpenRouterClient {
        +generateReport(args): Promise~Response~
        +generateInsights(args): Promise~Response~
        +validateConnection(): Promise~boolean~
        +executeRequest(payload): Promise~Response~
        +buildHeaders(): object
    }
    
    OpenRouterClient --> OpenRouterConfig
```

### Error Handling Strategy

Update error handling for OpenRouter:

| Error Type | Old Handling | New Handling |
|------------|--------------|---------------|
| Authentication | missing_openai_key | missing_openrouter_key |
| Model Config | missing_openai_model | missing_openrouter_model |
| Timeout | openai_timeout | openrouter_timeout |
| Rate Limiting | HTTP 429 passthrough | HTTP 429 with OpenRouter context |
| Empty Response | openai_empty_content | openrouter_empty_content |

### Request/Response Flow

#### Report Generation Flow
```mermaid
sequenceDiagram
    participant Route as "Generate Route"
    participant Service as "Report Service"
    participant Client as "OpenRouter Client"
    participant OpenRouter as "OpenRouter API"
    
    Route->>Service: generateReportFromPreview()
    Service->>Service: validateEnvironment()
    Service->>Client: createClient(config)
    Service->>Client: executeRequest(prompt, schema)
    Client->>Client: buildProviderRequest()
    Client->>OpenRouter: HTTP POST
    OpenRouter-->>Client: Response
    Client->>Client: normalizeResponse()
    Client->>Client: validateSchema()
    Client-->>Service: {json, requestId}
    Service->>Service: renderMarkdown()
    Service-->>Route: {json, markdown}
```

#### Insights Generation Flow
```mermaid
sequenceDiagram
    participant Route as "Insights Route"
    participant Service as "Report Service"
    participant Client as "OpenRouter Client"
    participant OpenRouter as "OpenRouter API"
    
    Route->>Service: generateInsightsFromMessages()
    Service->>Service: validateEnvironment()
    Service->>Client: createClient(config)
    Service->>Client: executeStreamingRequest(prompt)
    Client->>OpenRouter: HTTP POST (streaming)
    OpenRouter-->>Client: Streaming Response
    Client->>Client: pollUntilComplete()
    Client->>Client: extractTextContent()
    Client-->>Service: {markdown, requestId}
    Service-->>Route: {markdown}
```

This migration design provides a straightforward approach to switch from OpenAI to OpenRouter for cost optimization while maintaining system functionality.