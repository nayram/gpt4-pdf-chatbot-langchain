import { VectorStoreRetriever } from '@langchain/core/vectorstores';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { RunnableConfig } from '@langchain/core/runnables';
import {
  BaseConfigurationAnnotation,
  ensureBaseConfiguration,
} from './configuration.js';
import { DirectOllamaEmbeddings } from './directOllama.js';

export async function makeSupabaseRetriever(
  configuration: typeof BaseConfigurationAnnotation.State,
): Promise<VectorStoreRetriever> {
  // Supabase with direct Ollama not implemented - use postgres provider instead
  console.log('Configuration:', configuration); // Use configuration parameter to avoid warning
  throw new Error(
    'Supabase with direct Ollama not implemented yet - use postgres provider',
  );
}

export async function makePostgresRetriever(
  configuration: typeof BaseConfigurationAnnotation.State,
): Promise<VectorStoreRetriever> {
  // Get database connection details from environment
  const connectionString =
    process.env.DATABASE_URL ||
    `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || 'postgres'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'pdf_chatbot'}`;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL or PostgreSQL environment variables (POSTGRES_USER, POSTGRES_PASSWORD, etc.) are not defined',
    );
  }

  // Use direct Ollama embeddings for better performance and reliability
  const embeddings = new DirectOllamaEmbeddings({
    model: 'embeddinggemma',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  });

  const config = {
    postgresConnectionOptions: {
      connectionString,
    },
    tableName: 'document_chunks',
    columns: {
      idColumnName: 'id',
      vectorColumnName: 'embedding',
      contentColumnName: 'content',
      metadataColumnName: 'chunk_metadata',
    },
  };

  console.log(
    '🔧 Initializing PostgreSQL vector store with direct Ollama embeddings...',
  );
  const pgVectorStore = await PGVectorStore.initialize(embeddings, config);

  return pgVectorStore.asRetriever({
    k: configuration.k,
    filter: configuration.filterKwargs,
  });
}

export async function makeRetriever(
  config: RunnableConfig,
): Promise<VectorStoreRetriever> {
  const configuration = ensureBaseConfiguration(config);

  if (configuration.retrieverProvider === 'supabase') {
    return makeSupabaseRetriever(configuration);
  } else if (configuration.retrieverProvider === 'postgres') {
    return makePostgresRetriever(configuration);
  } else {
    throw new Error(
      `Unsupported retriever provider: ${configuration.retrieverProvider}`,
    );
  }
}
