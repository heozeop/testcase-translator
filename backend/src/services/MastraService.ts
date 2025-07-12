import { Anthropic } from '@anthropic-ai/sdk';

export interface MastraConfig {
  anthropicApiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

export interface LLMError {
  code: string;
  message: string;
  type: 'rate_limit' | 'api_error' | 'auth_error' | 'network_error' | 'validation_error' | 'unknown';
  retryable: boolean;
}

export class MastraService {
  private anthropic: Anthropic;
  private config: Required<MastraConfig>;

  constructor(config: MastraConfig) {
    this.config = {
      anthropicApiKey: config.anthropicApiKey,
      model: config.model || "claude-sonnet-4-20250514",
      maxTokens: config.maxTokens || 4000,
      temperature: config.temperature || 0.1,
      timeout: config.timeout || 300000 // 5 minutes timeout for AI requests
    };

    this.anthropic = new Anthropic({
      apiKey: this.config.anthropicApiKey,
      timeout: this.config.timeout,
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.anthropic.messages.create({
        model: this.config.model,
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: 'Test connection. Respond with "OK".'
          }
        ]
      });

      return response.content.some(content => 
        content.type === 'text' && content.text.includes('OK')
      );
    } catch (error) {
      console.error('Mastra connection test failed:', error);
      return false;
    }
  }

  async generateCompletion(
    prompt: string, 
    systemPrompt?: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
      stopSequences?: string[];
    }
  ): Promise<LLMResponse> {
    try {
      const messages: any[] = [
        {
          role: 'user',
          content: prompt
        }
      ];

      const requestOptions: any = {
        model: this.config.model,
        max_tokens: options?.maxTokens || this.config.maxTokens,
        temperature: options?.temperature || this.config.temperature,
        messages
      };

      if (systemPrompt) {
        requestOptions.system = systemPrompt;
      }

      if (options?.stopSequences && options.stopSequences.length > 0) {
        requestOptions.stop_sequences = options.stopSequences;
      }

      const response = await this.anthropic.messages.create(requestOptions);

      // Extract text content from response
      const textContent = response.content
        .filter(content => content.type === 'text')
        .map(content => (content as any).text)
        .join('');

      return {
        content: textContent,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens
        },
        finishReason: response.stop_reason || undefined
      };
    } catch (error: any) {
      throw this.formatError(error);
    }
  }

  async generateStructuredOutput<T>(
    prompt: string,
    systemPrompt: string,
    outputSchema: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<T> {
    const fullSystemPrompt = `${systemPrompt}

IMPORTANT: You must respond with valid JSON that matches the following schema:
${outputSchema}

Do not include any text outside of the JSON response. Ensure the JSON is properly formatted and valid.`;

    const response = await this.generateCompletion(
      prompt,
      fullSystemPrompt,
      {
        ...options,
        stopSequences: ['```', '---']
      }
    );

    try {
      // Clean up the response to extract JSON
      let jsonContent = response.content.trim();
      
      // Remove code blocks if present
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      // Try to extract JSON from the response
      const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonContent = jsonMatch[0];
      }

      return JSON.parse(jsonContent);
    } catch (parseError) {
      throw {
        code: 'JSON_PARSE_ERROR',
        message: `Failed to parse LLM response as JSON: ${parseError}. Response was: ${response.content}`,
        type: 'validation_error',
        retryable: false
      } as LLMError;
    }
  }

  private formatError(error: any): LLMError {
    let code = 'UNKNOWN_ERROR';
    let type: LLMError['type'] = 'unknown';
    let retryable = false;
    let message = error.message || 'Unknown error occurred';

    if (error.status) {
      switch (error.status) {
        case 400:
          code = 'BAD_REQUEST';
          type = 'validation_error';
          retryable = false;
          break;
        case 401:
          code = 'UNAUTHORIZED';
          type = 'auth_error';
          retryable = false;
          break;
        case 403:
          code = 'FORBIDDEN';
          type = 'auth_error';
          retryable = false;
          break;
        case 429:
          code = 'RATE_LIMITED';
          type = 'rate_limit';
          retryable = true;
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          code = 'SERVER_ERROR';
          type = 'api_error';
          retryable = true;
          break;
        default:
          code = `HTTP_${error.status}`;
          type = 'api_error';
          retryable = error.status >= 500;
      }
    } else if (error.code) {
      switch (error.code) {
        case 'ECONNABORTED':
        case 'ETIMEDOUT':
          code = 'TIMEOUT';
          type = 'network_error';
          retryable = true;
          break;
        case 'ENOTFOUND':
        case 'ECONNREFUSED':
          code = 'NETWORK_ERROR';
          type = 'network_error';
          retryable = true;
          break;
        default:
          code = error.code;
          type = 'unknown';
          retryable = false;
      }
    }

    return {
      code,
      message,
      type,
      retryable
    };
  }

  async generateWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: LLMError;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error as LLMError;
        
        if (!lastError.retryable || attempt > maxRetries) {
          throw lastError;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms. Error: ${lastError.message}`);
        await this.delay(delay);
      }
    }

    throw lastError!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get current configuration
  getConfig(): Required<MastraConfig> {
    return { ...this.config };
  }

  // Update configuration
  updateConfig(newConfig: Partial<MastraConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.anthropicApiKey) {
      this.anthropic = new Anthropic({
        apiKey: newConfig.anthropicApiKey,
        timeout: this.config.timeout,
      });
    }
  }
}