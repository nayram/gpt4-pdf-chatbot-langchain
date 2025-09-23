# Database Setup

Quick setup guide for the PostgreSQL vector database.

## Start the Database

```bash
# Copy environment variables
cp .env.example .env

# Edit .env with your preferred settings
nano .env

# Start PostgreSQL + PgAdmin
docker-compose up -d

# Or start PostgreSQL only
docker-compose up postgres -d
```

## Verify Setup

```bash
# Check container status
docker-compose ps

# Connect to database
docker-compose exec postgres psql -U postgres -d pdf_chatbot

# Test vector extension
# In psql: SELECT vector_dims('[1,2,3]'::vector);
```

## Access PgAdmin

- URL: http://localhost:8080
- Login with credentials from your `.env` file

## Connection String

```
postgresql://postgres:your_password@localhost:5432/pdf_chatbot
```

For detailed documentation, see [postgres_vector_database.md](./documentation/postgres_vector_database.md)
