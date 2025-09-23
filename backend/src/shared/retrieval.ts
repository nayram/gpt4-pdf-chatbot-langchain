import { VectorStoreRetriever } from '@langchain/core/vectorstores';
import { OllamaEmbeddings } from '@langchain/ollama';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { createClient } from '@supabase/supabase-js';
import { RunnableConfig } from '@langchain/core/runnables';
import {
  BaseConfigurationAnnotation,
  ensureBaseConfiguration,
} from './configuration.js';

export async function makeSupabaseRetriever(
  configuration: typeof BaseConfigurationAnnotation.State,
): Promise<VectorStoreRetriever> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables are not defined',
    );
  }
  const embeddings = new OllamaEmbeddings({
    model: 'embeddinggemma',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  });
  const supabaseClient = createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  );
  const vectorStore = new SupabaseVectorStore(embeddings, {
    client: supabaseClient,
    tableName: 'documents',
    queryName: 'match_documents',
  });
  return vectorStore.asRetriever({
    k: configuration.k,
    filter: configuration.filterKwargs,
  });
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

  const embeddings = new OllamaEmbeddings({
    model: 'embeddinggemma',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  });

  const config = {
    connectionString,
    tableName: 'document_chunks',
    columns: {
      idColumnName: 'id',
      vectorColumnName: 'embedding',
      contentColumnName: 'content',
      metadataColumnName: 'chunk_metadata',
    },
  };

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
