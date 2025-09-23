-- 02-create-schema-optimized.sql
-- Optimized schema for PDF chatbot application based on actual requirements

-- Enable the pgvector extension for vector operations
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Single table approach - stores document chunks with embeddings
-- This matches the LangChain Document structure used throughout the application
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Content and embedding (core requirements)
    content TEXT NOT NULL,
    embedding VECTOR(768), -- embeddinggemma model dimensions
    
    -- Document source information (from LangChain Document.metadata)
    source VARCHAR(500), -- Original file path/name
    
    -- PDF-specific metadata (extracted from LangChain PDF processing)
    page_number INTEGER,
    line_start INTEGER,
    line_end INTEGER,
    
    -- Document-level metadata (stored as JSONB for flexibility)
    pdf_metadata JSONB DEFAULT '{}', -- PDF info (title, creator, etc.)
    
    -- Chunk-specific metadata
    chunk_metadata JSONB DEFAULT '{}', -- Any additional chunk-level data
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Essential indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_chunks_source ON document_chunks(source);
CREATE INDEX IF NOT EXISTS idx_document_chunks_page ON document_chunks(page_number);

-- Vector similarity search index (HNSW for fast approximate nearest neighbor search)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks 
USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Full-text search index (for hybrid search capabilities)
CREATE INDEX IF NOT EXISTS idx_document_chunks_content_fts ON document_chunks 
USING gin(to_tsvector('english', content));

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update updated_at automatically
CREATE TRIGGER update_document_chunks_updated_at BEFORE UPDATE ON document_chunks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Optional: View for easier querying with computed fields
CREATE OR REPLACE VIEW document_chunks_with_similarity AS
SELECT 
    id,
    content,
    source,
    page_number,
    line_start,
    line_end,
    pdf_metadata,
    chunk_metadata,
    created_at,
    updated_at,
    -- Helper function to extract document title from metadata
    COALESCE(
        pdf_metadata->>'title',
        pdf_metadata->'pdf'->'info'->>'Title', 
        split_part(source, '/', -1)
    ) as document_title
FROM document_chunks;

-- Sample query functions for common operations

-- Function for vector similarity search
CREATE OR REPLACE FUNCTION search_similar_chunks(
    query_embedding VECTOR(768),
    similarity_threshold FLOAT DEFAULT 0.8,
    max_results INT DEFAULT 5
)
RETURNS TABLE(
    id UUID,
    content TEXT,
    source VARCHAR(500),
    page_number INTEGER,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id,
        dc.content,
        dc.source,
        dc.page_number,
        1 - (dc.embedding <=> query_embedding) as similarity
    FROM document_chunks dc
    WHERE dc.embedding IS NOT NULL
        AND (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Function for hybrid search (vector + text)
CREATE OR REPLACE FUNCTION hybrid_search_chunks(
    query_embedding VECTOR(768),
    query_text TEXT,
    max_results INT DEFAULT 5,
    vector_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE(
    id UUID,
    content TEXT,
    source VARCHAR(500),
    page_number INTEGER,
    combined_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id,
        dc.content,
        dc.source,
        dc.page_number,
        (
            (1 - (dc.embedding <=> query_embedding)) * vector_weight +
            ts_rank(to_tsvector('english', dc.content), plainto_tsquery(query_text)) * (1 - vector_weight)
        ) as combined_score
    FROM document_chunks dc
    WHERE dc.embedding IS NOT NULL
        AND (
            (1 - (dc.embedding <=> query_embedding)) > 0.3 OR
            to_tsvector('english', dc.content) @@ plainto_tsquery(query_text)
        )
    ORDER BY combined_score DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;