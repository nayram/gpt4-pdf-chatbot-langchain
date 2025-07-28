# Project Summary: AI PDF Chatbot & Agent

This project is a monorepo implementing an AI PDF Chatbot and Agent, designed to ingest PDF documents, store embeddings, and answer user queries using LLMs. It serves as a reference implementation for building robust, production-grade LLM applications.

## Architecture Overview
- **Monorepo Structure**: Managed by Yarn workspaces and Turborepo, separating frontend and backend.
- **Frontend**: Next.js (React) application for UI, file uploads, and chat interaction.
- **Backend**: Node.js (TypeScript) service orchestrating AI logic using LangChain.js and LangGraph.
- **Vector Store**: Supabase for storing document embeddings and similarity searches.
- **LLM Provider**: OpenAI (default) for language models.

## Core Components (LangGraph)
1.  **Ingestion Graph**: Processes uploaded PDFs, creates vector embeddings, and stores them in Supabase.
2.  **Retrieval Graph**: Manages chat logic, including query understanding, document retrieval from Supabase, and response generation (RAG agent).

## Key Design Principles & Patterns
- **Separation of Concerns**: Distinct Ingestion and Retrieval Graphs for modularity and scalability.
- **LangGraph for Orchestration**: Provides a structured, observable, and extensible way to manage logic via state machines.
- **Configuration-Driven Components**: Flexible management of settings like model names and retriever providers.
- **Observability**: Emphasis on tracing (LangSmith) and state logging for debugging.
- **Volatility Control**: Isolating LLM components, using structured output, and configuration-driven models.
- **Evaluation & Testing**: Importance of "Eval Sets" and continuous evaluation for quality assurance.
- **Cost Optimization**: Router pattern, model cascading, and aggressive caching.
- **Responsible AI**: Input/output sanitization, groundedness checks, graceful fallbacks, and content moderation.

## Documentation
Extensive documentation is available in the `documentation/` folder, covering:
- Project Architecture Analysis
- Deep Dives into Ingestion and Retrieval Graphs
- Architect's Mindset (Guiding Questions)
- Production Principles for LLM Applications
- Proposed Project Improvements (roadmap for future enhancements)
