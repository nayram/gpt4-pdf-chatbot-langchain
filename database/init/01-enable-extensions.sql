-- 01-enable-extensions.sql
-- Enable the pgvector extension for vector operations
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable other useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Verify extensions are installed
SELECT name, default_version, installed_version 
FROM pg_available_extensions 
WHERE name IN ('vector', 'uuid-ossp', 'pg_trgm');

-- Show vector extension functions
\df *vector*;