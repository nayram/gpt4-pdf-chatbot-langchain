
# 1. Project Architecture Analysis

This project is a monorepo containing a full-stack application for a PDF chatbot. It is designed with a clear separation of concerns between the frontend and backend, managed by Yarn workspaces and Turborepo.

## High-Level Overview

The application follows a standard client-server model:

*   **Frontend:** A Next.js (React) application that provides the user interface for uploading PDF documents and interacting with the chatbot.
*   **Backend:** A Node.js (TypeScript) service that uses the LangChain.js and LangGraph libraries to orchestrate the AI logic.
*   **Vector Store:** Supabase is used as the vector database to store document embeddings and perform similarity searches.
*   **LLM Provider:** OpenAI is the default provider for language models.

The core of the application is the backend, which is built around two main LangGraph graphs:

1.  **Ingestion Graph:** Handles the processing of uploaded PDF files, creating vector embeddings, and storing them in Supabase.
2.  **Retrieval Graph:** Manages the chat logic, including understanding the user's query, retrieving relevant documents from Supabase, and generating a response.

## Technology Stack

### Root

*   **`yarn workspaces`**: Manages the monorepo structure, allowing for shared dependencies and scripts between the `frontend` and `backend`.
*   **`turbo`**: A high-performance build system for monorepos. It optimizes running scripts across the workspaces, caching results to speed up development.

### Backend (`/backend`)

*   **`typescript`**: Provides static typing for building a robust and maintainable codebase.
*   **`@langchain/langgraph`**: The core orchestration framework. It allows for building stateful, multi-actor applications using a graph-based approach. This is the "brain" of the application.
*   **`@langchain/openai`**: Provides integrations with OpenAI's language models.
*   **`@langchain/community`**: Contains community-contributed integrations, including the Supabase vector store.
*   **`@supabase/supabase-js`**: The official client library for interacting with Supabase.
*   **`chromadb`**: An open-source embedding database.
*   **`pdf-parse`**: A library for extracting text content from PDF files.
*   **`jest`**: The testing framework used for unit and integration tests.

### Frontend (`/frontend`)

*   **`next.js`**: A popular React framework for building server-rendered and static web applications.
*   **`react`**: The core UI library.
*   **`tailwindcss`**: A utility-first CSS framework for rapid UI development.
*   **`@radix-ui/*`**: A collection of accessible, unstyled UI components that serve as the foundation for the custom UI components in `/components/ui`.
*   **`@langchain/langgraph-sdk`**: The client-side SDK for interacting with the LangGraph backend.
*   **`react-hook-form`**: A library for managing forms in React.
*   **`zod`**: A TypeScript-first schema declaration and validation library, used for form validation.

## Key Design Decisions

*   **Monorepo Structure:** Using a monorepo simplifies dependency management and allows for easy code sharing between the frontend and backend. It also streamlines the development and build process with tools like Turborepo.
*   **Separation of Graphs:** The decision to split the core logic into two distinct graphs (Ingestion and Retrieval) is a critical architectural choice. It decouples the two main workflows, making the system more modular, scalable, and easier to maintain.
*   **LangGraph for Orchestration:** Using LangGraph instead of a simple script or chain provides a more structured, observable, and extensible way to manage the application's logic. The state machine approach makes the agent's "thinking process" explicit and debuggable.
*   **Configuration-Driven Components:** The use of configuration objects (e.g., `ensureAgentConfiguration`) to manage settings like model names and retriever providers makes the system highly flexible and adaptable to future changes.
*   **Component-Based UI:** The frontend leverages a component-based architecture, using a combination of custom components and primitives from Radix UI. This promotes reusability and maintainability of the UI code.
