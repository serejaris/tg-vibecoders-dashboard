/**
 * OpenRouter Client Implementation
 * 
 * This module provides OpenRouter integration compatible with the existing OpenAI Responses API.
 * It replaces the OpenAI client while maintaining the same interface for seamless migration.
 */

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeout?: number;
  maxTokens?: number;
}

export interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  _request_id?: string;
}

export interface StructuredResponse {
  output_text?: string;
  status?: string;
  id?: string;
  _request_id?: string;
}

export class OpenRouterClient {
  private config: OpenRouterConfig;
  private baseUrl: string;

  constructor(config: OpenRouterConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
  }

  /**
   * Creates a structured response request compatible with OpenAI Responses API
   */
  async createStructuredResponse(params: {
    model: string;
    instructions: string;
    input: string;
    text?: {
      format: {
        type: string;
        name: string;
        schema: any;
        strict: boolean;
      };
    };
    max_output_tokens?: number;
  }): Promise<StructuredResponse> {
    const headers = this.buildHeaders();
    
    // Convert OpenAI Responses API format to OpenRouter chat completions format
    const messages = [
      {
        role: 'system',
        content: params.instructions
      },
      {
        role: 'user',
        content: params.input
      }
    ];

    const payload: any = {
      model: params.model,
      messages,
      max_tokens: params.max_output_tokens || this.config.maxTokens
    };

    // If structured output is requested, use response_format
    if (params.text?.format?.type === 'json_schema') {
      payload.response_format = {
        type: 'json_object'
      };
    }

    const response = await this.executeRequest('/chat/completions', payload, headers);
    
    // Convert OpenRouter response to OpenAI Responses API format
    return this.normalizeToResponsesFormat(response);
  }

  /**
   * Creates a streaming response for insights generation
   */
  async createStreamingResponse(params: {
    model: string;
    instructions: string;
    input: string;
    max_output_tokens?: number;
  }): Promise<StructuredResponse> {
    const headers = this.buildHeaders();
    
    const messages = [
      {
        role: 'system',
        content: params.instructions
      },
      {
        role: 'user',
        content: params.input
      }
    ];

    const payload = {
      model: params.model,
      messages,
      max_tokens: params.max_output_tokens || this.config.maxTokens || 800,
      stream: false // OpenRouter handles this differently
    };

    const response = await this.executeRequest('/chat/completions', payload, headers);
    return this.normalizeToResponsesFormat(response);
  }

  /**
   * Builds the required headers for OpenRouter API requests
   */
  private buildHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/tg-vibecoders-dashboard',
      'X-Title': 'Telegram Dashboard'
    };
  }

  /**
   * Executes the HTTP request to OpenRouter API
   */
  private async executeRequest(
    endpoint: string, 
    payload: any, 
    headers: Record<string, string>
  ): Promise<OpenRouterResponse> {
    const url = `${this.baseUrl}${endpoint}`;
    const timeoutMs = this.config.timeout || 120000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
        (error as any).statusCode = response.status;
        (error as any).responseText = errorText;
        throw error;
      }

      const data = await response.json();
      
      // Add request ID if available from headers
      const requestId = response.headers.get('x-request-id') || 
                       response.headers.get('x-ratelimit-requests-remaining') ||
                       `or_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      data._request_id = requestId;
      
      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('openrouter_timeout');
      }
      
      // Re-throw with OpenRouter context
      if (error.message && !error.message.includes('OpenRouter')) {
        error.message = `OpenRouter: ${error.message}`;
      }
      
      throw error;
    }
  }

  /**
   * Converts OpenRouter response format to OpenAI Responses API format
   */
  private normalizeToResponsesFormat(response: OpenRouterResponse): StructuredResponse {
    const content = response.choices?.[0]?.message?.content;
    
    return {
      id: response.id,
      output_text: content,
      status: 'completed',
      _request_id: response._request_id
    };
  }

  /**
   * Validates the OpenRouter connection and configuration
   */
  async validateConnection(): Promise<boolean> {
    try {
      const headers = this.buildHeaders();
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': headers.Authorization
        }
      });
      
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Factory function to create OpenRouter client with environment configuration
 */
export function createOpenRouterClient(): OpenRouterClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  
  if (!apiKey) {
    throw new Error('missing_openrouter_key');
  }
  
  if (!model) {
    throw new Error('missing_openrouter_model');
  }

  const config: OpenRouterConfig = {
    apiKey,
    model,
    baseUrl: process.env.OPENROUTER_BASE_URL,
    timeout: Number.parseInt(process.env.REPORT_TIMEOUT_MS || '120000', 10),
    maxTokens: Number.isFinite(Number.parseInt(process.env.REPORT_MAX_OUTPUT_TOKENS || '', 10))
      ? Number.parseInt(process.env.REPORT_MAX_OUTPUT_TOKENS as string, 10)
      : undefined
  };

  return new OpenRouterClient(config);
}