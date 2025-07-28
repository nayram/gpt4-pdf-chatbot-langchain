
# 4. The Architect's Mindset: Guiding Questions

Good architecture is born from asking the right questions before writing code. This section outlines the mental models and guiding questions used to design this system, providing a framework for approaching the design of any LLM application.

## High-Level System Design Questions

1.  **"What are the distinct, independent workflows of this system?"**
    *   **Purpose:** To identify the major, decoupled components of the system.
    *   **In this project:** This question led to the separation of the **Ingestion Graph** and the **Retrieval Graph**. Ingestion is a one-way data processing task, while retrieval is a request-response loop. Decoupling them improves scalability, maintainability, and fault isolation.

2.  **"How will we know what this system is doing? How do we debug it when it fails?"**
    *   **Purpose:** To prioritize observability from the start.
    *   **In this project:** This led to the choice of **LangGraph**. Its explicit state machine model makes the agent's "thinking process" transparent. The state object at each step becomes a rich, structured log, which is invaluable for debugging when combined with a tracing platform like LangSmith.

3.  **"What parts of this system are most likely to change in the future?"**
    *   **Purpose:** To identify volatile components and isolate them to build an extensible system.
    *   **In this project:** The LLM provider, the vector store, and the document sources were identified as likely to change. This led to the use of the **Strategy Pattern** and **Configuration-driven design**. Functions like `makeRetriever` and `loadChatModel` act as factories that abstract away the specific implementation details, allowing them to be swapped via configuration without changing the core graph logic.

## Defining State: A Mental Workflow

The state is the memory of your agent. Designing it well is critical.

**The Golden Question: "If this entire workflow were one giant, synchronous function, what variables would it need to keep track of from start to finish?"**

This question helps you brainstorm the raw components of your state. For the retrieval agent, this would lead to identifying the need for `query`, `route`, `documents`, and `messages`.

### State Refinement Questions

1.  **"What is *state* versus what is *configuration*?"**
    *   **State:** Dynamic information that is *created or modified* during a run (e.g., the list of retrieved `documents`).
    *   **Configuration:** Static parameters that are *set at the beginning* and do not change (e.g., the `queryModel` to use).
    *   **Why it matters:** This separation keeps the state clean and focused on the data being processed, while making the system's parameters explicit and easy to manage.

2.  **"For each piece of state, *how* does it change?"**
    *   **Purpose:** To determine if a field needs a reducer function.
    *   **Example:**
        *   `query`: Set once, never changes. No reducer needed.
        *   `messages`: A list that always grows by appending. This accumulation pattern is perfect for a reducer. The pre-built `MessagesAnnotation` provides one.
        *   `documents`: Also a list that accumulates. This requires a custom reducer (`reduceDocs`) to handle appending new documents.

3.  **"What is the absolute minimum information needed for the agent to make its next decision?"**
    *   **Purpose:** To avoid a bloated state object and keep the logic of each node simple.
    *   **Example:** The `retrieveDocuments` node only needs the `query` from the state. The `generateResponse` node only needs the `query` and the `documents`. This focus makes each component more cohesive and easier to test.
