# PostgreSQL Vector Database Setup

This document describes the PostgreSQL database setup with pgvector extension for the PDF chatbot application.

## Overview

The application uses PostgreSQL with the `pgvector` extension as the vector database for storing document embeddings and performing similarity searches. The database is containerized using Docker Compose for easy deployment and management.

## Database Architecture

### Extensions Used

- **pgvector**: Enables vector operations and similarity search
- **uuid-ossp**: Provides UUID generation functions
- **pg_trgm**: Enables trigram-based text search capabilities

### Database Schema

#### Core Tables

1. **`documents`**: Stores PDF file metadata and processing status
2. **`document_chunks`**: Stores text chunks with their vector embeddings
3. **`chat_sessions`**: Manages chat conversation sessions
4. **`chat_messages`**: Stores individual messages within chat sessions

#### Key Features

- **Vector Embeddings**: `document_chunks.embedding` column stores 1536-dimensional vectors (configurable)
- **HNSW Index**: High-performance vector similarity search using Hierarchical Navigable Small World algorithm
- **JSONB Metadata**: Flexible metadata storage for documents and messages
- **Automatic Timestamps**: Auto-updating `created_at` and `updated_at` fields
- **Foreign Key Constraints**: Ensures data integrity across related tables

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- At least 2GB of available RAM for PostgreSQL

### Setup Steps

1. **Copy Environment Variables**:

   ```bash
   cp .env.example .env
   ```

2. **Edit Environment Variables** (`.env`):

   ```bash
   # Update with your preferred values
   POSTGRES_PASSWORD=your_secure_password
   PGADMIN_DEFAULT_EMAIL=your_email@example.com
   PGADMIN_DEFAULT_PASSWORD=your_admin_password
   ```

3. **Start the Database**:

   ```bash
   # Start PostgreSQL only
   docker-compose up postgres -d

   # Or start PostgreSQL + PgAdmin
   docker-compose up -d
   ```

4. **Verify Setup**:

   ```bash
   # Check container status
   docker-compose ps

   # Connect to database
   docker-compose exec postgres psql -U postgres -d pdf_chatbot
   ```

### Testing Vector Operations

Once connected to the database, you can test vector operations:

```sql
-- Test vector extension
SELECT vector_dims('[1,2,3]'::vector);

-- Test similarity search (example with random vectors)
SELECT
    content,
    embedding <=> '[0.1,0.2,0.3,...]'::vector AS distance
FROM document_chunks
WHERE embedding IS NOT NULL
ORDER BY embedding <=> '[0.1,0.2,0.3,...]'::vector
LIMIT 5;
```

## Database Connection

### Connection Details

- **Host**: `localhost` (when accessing from host machine)
- **Port**: `5432` (default, configurable via `POSTGRES_PORT`)
- **Database**: `pdf_chatbot` (configurable via `POSTGRES_DB`)
- **User**: `postgres` (configurable via `POSTGRES_USER`)

### Connection Strings

#### For Node.js/TypeScript Applications:

```typescript
const connectionString = `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`;
```

#### For Python Applications:

```python
import os
connection_string = f"postgresql://{os.getenv('POSTGRES_USER')}:{os.getenv('POSTGRES_PASSWORD')}@{os.getenv('POSTGRES_HOST')}:{os.getenv('POSTGRES_PORT')}/{os.getenv('POSTGRES_DB')}"
```

## Vector Operations

### Supported Distance Functions

- **Cosine Distance**: `<=>` (recommended for normalized embeddings)
- **L2 Distance**: `<->` (Euclidean distance)
- **Inner Product**: `<#>` (for dot product similarity)

### Example Queries

#### Insert Document with Embedding:

```sql
INSERT INTO document_chunks (document_id, chunk_index, content, embedding)
VALUES (
    uuid_generate_v4(),
    1,
    'This is a sample text chunk.',
    '[0.1,0.2,0.3,0.4,...]'::vector
);
```

#### Similarity Search:

```sql
-- Find top 5 most similar chunks
SELECT
    id,
    content,
    embedding <=> $1::vector AS cosine_distance
FROM document_chunks
WHERE embedding IS NOT NULL
ORDER BY embedding <=> $1::vector
LIMIT 5;
```

#### Hybrid Search (Vector + Text):

```sql
-- Combine vector similarity with text search
SELECT
    dc.id,
    dc.content,
    dc.embedding <=> $1::vector AS similarity,
    ts_rank(to_tsvector('english', dc.content), plainto_tsquery($2)) AS text_rank
FROM document_chunks dc
WHERE dc.embedding IS NOT NULL
    AND to_tsvector('english', dc.content) @@ plainto_tsquery($2)
ORDER BY
    (dc.embedding <=> $1::vector) * 0.7 +
    (1 - ts_rank(to_tsvector('english', dc.content), plainto_tsquery($2))) * 0.3
LIMIT 10;
```

## Administration

### PgAdmin Access

If you started the PgAdmin service, you can access the web interface at:

- **URL**: `http://localhost:8080` (or your configured port)
- **Email**: Set in `PGADMIN_DEFAULT_EMAIL`
- **Password**: Set in `PGADMIN_DEFAULT_PASSWORD`

### Useful Commands

#### Database Management:

```bash
# View logs
docker-compose logs postgres

# Backup database
docker-compose exec postgres pg_dump -U postgres pdf_chatbot > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T postgres psql -U postgres pdf_chatbot

# Access database shell
docker-compose exec postgres psql -U postgres pdf_chatbot
```

#### Performance Monitoring:

```sql
-- Check database size
SELECT pg_size_pretty(pg_database_size('pdf_chatbot'));

-- Check table sizes
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size(tablename::regclass)) AS size
FROM pg_tables
WHERE schemaname = 'public';

-- Monitor vector index usage
SELECT * FROM pg_stat_user_indexes WHERE indexrelname LIKE '%embedding%';
```

## Configuration Options

### Vector Dimensions

The default embedding dimension is set to 1536 (OpenAI Ada-002). To use different embedding models:

1. Update the `VECTOR_DIMENSION` in your `.env` file
2. Modify the `embedding VECTOR(1536)` column definition in `02-create-schema.sql`
3. Recreate the database or alter the column

### Index Tuning

The HNSW index is configured with:

- `m = 16`: Number of connections for each node
- `ef_construction = 64`: Size of the candidate list during index construction

For larger datasets, consider increasing these values:

```sql
-- Example for larger datasets
CREATE INDEX idx_document_chunks_embedding ON document_chunks
USING hnsw (embedding vector_cosine_ops) WITH (m = 32, ef_construction = 128);
```

## Troubleshooting

### Common Issues

1. **Extension Not Found**: Ensure you're using the `pgvector/pgvector` Docker image
2. **Connection Refused**: Check if the container is running with `docker-compose ps`
3. **Slow Vector Queries**: Ensure the HNSW index is created and `ANALYZE document_chunks;` has been run
4. **Memory Issues**: Increase Docker's memory limit or reduce `ef_construction` parameter

### Health Checks

The Docker Compose configuration includes health checks. Monitor with:

```bash
docker-compose ps
docker-compose logs postgres
```

## Security Considerations

1. **Change Default Passwords**: Always update `POSTGRES_PASSWORD` and `PGADMIN_DEFAULT_PASSWORD`
2. **Network Security**: Consider using Docker networks and avoiding `host` networking in production
3. **Connection Encryption**: Enable SSL in production environments
4. **User Management**: Create application-specific database users with limited privileges

## Performance Optimization

1. **Regular Maintenance**:

   ```sql
   VACUUM ANALYZE document_chunks;
   REINDEX INDEX idx_document_chunks_embedding;
   ```

2. **Monitor Query Performance**:

   ```sql
   -- Enable query logging
   ALTER SYSTEM SET log_min_duration_statement = 1000;
   SELECT pg_reload_conf();
   ```

3. **Batch Insertions**: Use batch inserts for better performance when adding multiple embeddings
