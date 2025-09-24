import { Ollama } from 'ollama';
import { AIMessage } from '@langchain/core/messages';
import { Embeddings } from '@langchain/core/embeddings';

/**
 * Direct Ollama chat client for simple text generation
 */
export class DirectOllamaChat {
  private readonly ollama: Ollama;
  private readonly modelName: string;
  private readonly temperature: number;

  constructor(options: {
    baseUrl?: string;
    model: string;
    temperature?: number;
  }) {
    this.ollama = new Ollama({
      host:
        options.baseUrl ||
        process.env.OLLAMA_BASE_URL ||
        'http://localhost:11434',
    });
    this.modelName = options.model;
    this.temperature = options.temperature || 0;
  }

  async invoke(input: string): Promise<AIMessage> {
    try {
      const response = await this.ollama.chat({
        model: this.modelName,
        messages: [{ role: 'user', content: input }],
        options: {
          temperature: this.temperature,
        },
      });

      return new AIMessage(response.message.content);
    } catch (error) {
      console.error('Direct Ollama chat error:', error);
      throw error;
    }
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.invoke(prompt);
    return typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
  }

  /**
   * Generate structured output with JSON parsing
   */
  async generateStructured<T = unknown>(
    prompt: string,
    schema?: unknown,
  ): Promise<T> {
    // Add JSON formatting instruction to the prompt
    const structuredPrompt = schema
      ? `${prompt}\n\nRespond with valid JSON matching this structure. Respond ONLY with JSON, no other text.`
      : `${prompt}\n\nRespond with valid JSON. Respond ONLY with JSON, no other text.`;

    const response = await this.generate(structuredPrompt);

    try {
      return JSON.parse(response.trim()) as T;
    } catch (parseError) {
      console.warn(
        'JSON parsing failed, attempting to extract JSON from response...',
        parseError,
      );

      // Try to extract JSON from the response using regex
      const jsonRegex = /\{[\s\S]*\}/;
      const jsonMatch = jsonRegex.exec(response);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]) as T;
        } catch (secondParseError) {
          console.error('Failed to parse extracted JSON', secondParseError);
          throw new Error(`Failed to parse extracted JSON: ${jsonMatch[0]}`);
        }
      }

      // If all parsing fails, throw with the original response
      throw new Error(`Failed to parse JSON response: ${response}`);
    }
  }

  /**
   * LangChain-compatible structured output method
   */
  withStructuredOutput<T = unknown>(
    schema: unknown,
  ): DirectOllamaStructuredChat<T> {
    return new DirectOllamaStructuredChat<T>(this, schema);
  }
}

/**
 * Wrapper class for structured output compatibility with LangChain
 */
class DirectOllamaStructuredChat<T = unknown> {
  constructor(
    private readonly chat: DirectOllamaChat,
    private readonly schema: unknown,
  ) {}

  async invoke(input: string): Promise<T> {
    return await this.chat.generateStructured<T>(input, this.schema);
  }
}

/**
 * Direct Ollama embeddings implementation compatible with LangChain
 */
export class DirectOllamaEmbeddings extends Embeddings {
  private readonly ollama: Ollama;
  private readonly modelName: string;

  constructor(options: { baseUrl?: string; model: string }) {
    super({});
    this.ollama = new Ollama({
      host:
        options.baseUrl ||
        process.env.OLLAMA_BASE_URL ||
        'http://localhost:11434',
    });
    this.modelName = options.model;
  }

  async embedQuery(text: string): Promise<number[]> {
    try {
      const response = await this.ollama.embeddings({
        model: this.modelName,
        prompt: text,
      });
      return response.embedding;
    } catch (error) {
      console.error('Direct Ollama embeddings error:', error);
      throw error;
    }
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    console.log(
      `🔄 Generating embeddings for ${texts.length} documents using direct Ollama...`,
    );
    const embeddings = await Promise.all(
      texts.map((text, index) => {
        if (index % 10 === 0) {
          console.log(`📝 Processing document ${index + 1}/${texts.length}`);
        }
        return this.embedQuery(text);
      }),
    );
    console.log(
      `✅ Generated ${embeddings.length} embeddings using direct Ollama`,
    );
    return embeddings;
  }
}
