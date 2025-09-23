# Ollama Setup for Local AI (Chat + Embeddings)

This application now uses Ollama for both chat and embeddings, providing a completely local AI experience.

## Prerequisites

1. **Install Ollama**: https://ollama.ai/
2. **Pull required models**:

   ```bash
   # For embeddings
   ollama pull embeddinggemma

   # For chat (choose one or more)
   ollama pull llama3.2          # Recommended: Fast and capable
   ollama pull llama3.2:70b      # Larger, more capable but slower
   ollama pull mistral           # Alternative option
   ollama pull codellama         # Good for code-related questions
   ```

## Configuration

1. **Copy environment variables**:

   ```bash
   cp .env.example .env
   ```

2. **Update .env file**:

   ```bash
   # Ollama Configuration
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_CHAT_MODEL=llama3.2          # Main chat model
   OLLAMA_EMBEDDING_MODEL=embeddinggemma # Embedding model

   # Vector Database Configuration
   VECTOR_DIMENSION=768  # embeddinggemma dimensions
   EMBEDDING_MODEL=embeddinggemma

   # PostgreSQL Configuration
   POSTGRES_PASSWORD=your_secure_password
   # ... other postgres settings
   ```

## Start Services

1. **Start Ollama** (in separate terminal):

   ```bash
   ollama serve
   ```

2. **Start PostgreSQL**:

   ```bash
   docker-compose up -d
   ```

3. **Verify Ollama models are working**:

   ```bash
   # Test embedding model
   curl http://localhost:11434/api/embeddings -d '{
     "model": "embeddinggemma",
     "prompt": "test"
   }'

   # Test chat model
   curl http://localhost:11434/api/chat -d '{
     "model": "llama3.2",
     "messages": [{"role": "user", "content": "Hello!"}]
   }'
   ```

## Model Recommendations

### **Chat Models** (choose based on your hardware):

| **Model**      | **Size** | **RAM Required** | **Speed** | **Quality** | **Use Case**                  |
| -------------- | -------- | ---------------- | --------- | ----------- | ----------------------------- |
| `llama3.2`     | ~2GB     | 4GB+             | ⚡⚡⚡    | ⭐⭐⭐      | General chat, fast responses  |
| `llama3.2:70b` | ~40GB    | 48GB+            | ⚡        | ⭐⭐⭐⭐⭐  | High-quality responses        |
| `mistral`      | ~4GB     | 6GB+             | ⚡⚡      | ⭐⭐⭐⭐    | Good balance of speed/quality |
| `codellama`    | ~4GB     | 6GB+             | ⚡⚡      | ⭐⭐⭐      | Code-focused conversations    |

### **How to Change Models**

Update the model in `/frontend/constants/graphConfigs.ts`:

```typescript
export const retrievalAssistantStreamConfig = {
  queryModel: 'ollama/mistral', // or 'ollama/llama3.2:70b', etc.
  retrieverProvider: 'postgres',
  k: 5,
};
```

## Benefits

- ✅ **No API costs** - Everything runs locally
- ✅ **Privacy** - No data sent to external services
- ✅ **Fast** - Local processing (with good hardware)
- ✅ **Offline capable** - Works without internet
- ✅ **Customizable** - Switch models easily

## Troubleshooting

- **Ollama not found**: Make sure Ollama is installed and running (`ollama serve`)
- **Model not found**: Run `ollama pull [model-name]` for both chat and embedding models
- **Connection refused**: Check `OLLAMA_BASE_URL` in your .env file
- **Wrong dimensions**: embeddinggemma uses 768 dimensions (not 1536 like OpenAI)
- **Slow responses**: Consider using a smaller model like `llama3.2` instead of `llama3.2:70b`
- **Out of memory**: Reduce model size or increase system RAM
