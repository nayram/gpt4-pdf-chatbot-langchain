import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentStateAnnotation } from './state.js';
import { makeRetriever } from '../shared/retrieval.js';
import { formatDocs } from './utils.js';
import { HumanMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { RESPONSE_SYSTEM_PROMPT } from './prompts.js';
import { RunnableConfig } from '@langchain/core/runnables';
import {
  AgentConfigurationAnnotation,
  ensureAgentConfiguration,
} from './configuration.js';
import { loadChatModel } from '../shared/utils.js';
import { DirectOllamaChat } from '../shared/directOllama.js';

/**
 * Extract route value from different possible response formats
 */
function extractRouteFromResponse(response: unknown): 'retrieve' | 'direct' {
  if (typeof response !== 'object' || response === null) {
    return 'retrieve'; // Safe fallback
  }

  const obj = response as Record<string, unknown>;

  // Check for direct route property
  if (typeof obj.route === 'string') {
    return obj.route as 'retrieve' | 'direct';
  }

  // Check for nested routing.type structure
  if (typeof obj.routing === 'object' && obj.routing !== null) {
    const routing = obj.routing as Record<string, unknown>;
    if (typeof routing.type === 'string') {
      return routing.type as 'retrieve' | 'direct';
    }
  }

  // Check for direct type property
  if (typeof obj.type === 'string') {
    return obj.type as 'retrieve' | 'direct';
  }

  console.warn('Unexpected response format, using fallback:', response);
  return 'retrieve'; // Safe fallback
}

/**
 * Route queries using direct Ollama client with structured output support
 */
async function routeWithDirectOllama(
  configuration: RunnableConfig,
  formattedPrompt: string,
): Promise<{ route: 'retrieve' | 'direct' }> {
  const configState = ensureAgentConfiguration(configuration);
  const modelName = configState.queryModel.replace('ollama/', '');
  const ollamaChat = new DirectOllamaChat({
    model: modelName,
    temperature: 0,
  });

  try {
    console.log(
      '🔍 Using direct Ollama with structured output for routing with model:',
      modelName,
    );

    // Try structured output first (now supported with direct Ollama)
    const schema = z.object({
      route: z.enum(['retrieve', 'direct']),
      reasoning: z.string().optional(),
    });

    const structuredChat = ollamaChat.withStructuredOutput(schema);
    const response = await structuredChat.invoke(formattedPrompt);

    console.log('✅ Structured output successful:', response);

    // Extract route value from different possible response formats
    const routeValue = extractRouteFromResponse(response);
    return { route: routeValue };
  } catch (error) {
    console.log(
      '⚠️ Structured output failed, falling back to text parsing:',
      error,
    );

    // Fallback to text parsing
    try {
      const response = await ollamaChat.generate(formattedPrompt);
      const responseText = response.toLowerCase();

      console.log(
        '📝 Fallback response:',
        responseText.substring(0, 100) + '...',
      );

      // Simple text parsing to determine route
      if (
        responseText.includes('retrieve') ||
        responseText.includes('search') ||
        responseText.includes('document')
      ) {
        console.log('📍 Route determined: retrieve');
        return { route: 'retrieve' };
      } else {
        console.log('📍 Route determined: direct');
        return { route: 'direct' };
      }
    } catch (fallbackError) {
      console.error(
        '❌ Both structured and text parsing failed:',
        fallbackError,
      );
      // Ultimate fallback to retrieve for safety
      return { route: 'retrieve' };
    }
  }
}

async function checkQueryType(
  state: typeof AgentStateAnnotation.State,
  config: RunnableConfig,
): Promise<{ route: 'retrieve' | 'direct' }> {
  console.log('🔍 Checking query type for:', state.query.slice(0, 50) + '...');

  const template = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are a routing assistant for a learning-focused CUE Content Store documentation system.

CONTEXT:
- Company: stibodx
- Product: CUE - A comprehensive media enterprise platform for news organizations
- Documentation: CUE Content Store Publication Design Guide
- User: New team member learning CUE Content Store concepts and implementation

Your job is to determine if a question needs document retrieval from the CUE Content Store technical documentation or can be answered directly.

ROUTING RULES FOR LEARNING CONTEXT:
1. "retrieve" - Use when the question would benefit from documentation-backed explanations:
   * CUE Content Store features, configuration, or technical details
   * Publication design guidelines and best practices  
   * Content management workflows and processes
   * Technical implementation details and examples
   * Specific CUE platform capabilities or limitations
   * Integration guides or API documentation
   * Requests for examples, code snippets, XML configurations, or sample implementations
   * "How do I..." or "Show me an example of..." type questions
   * Conceptual explanations that benefit from official documentation context
   * Learning-focused requests like "explain in detail" or "help me understand"
   
2. "direct" - Use for questions that don't require technical documentation:
   * General greetings and casual conversation
   * Questions about stibodx as a company (general information)
   * Meta-questions about the learning process itself
   * Simple acknowledgments or follow-up confirmations

LEARNING PRIORITY: When in doubt, favor 'retrieve' to provide comprehensive, documentation-backed explanations that support deep learning and understanding.

RESPONSE FORMAT: You must respond with valid JSON in this exact format:
{{
  "route": "retrieve" or "direct",
  "reasoning": "brief explanation of your choice"
}}

Choose wisely to provide the best learning experience for new CUE platform users.`,
    ],
    ['human', '{question}'],
  ]);

  const formattedPrompt = await template.formatPromptValue({
    question: state.query,
  });

  const configuration = ensureAgentConfiguration(config);

  // Check if we're using an Ollama model
  if (configuration.queryModel.startsWith('ollama/')) {
    return routeWithDirectOllama(config, formattedPrompt.toString());
  }

  // Use LangChain for non-Ollama models
  const model = await loadChatModel(configuration.queryModel);

  try {
    // Try structured output first (works with OpenAI models)
    const schema = z.object({
      route: z.enum(['retrieve', 'direct']),
      reasoning: z.string(),
      directAnswer: z.string().optional(),
    });

    const response = await model
      .withStructuredOutput(schema)
      .invoke(formattedPrompt.toString());

    console.log('✅ Structured output successful:', response);

    return { route: response.route };
  } catch (error) {
    console.log(
      'Structured output failed, falling back to text parsing:',
      error.message,
    );

    // Fallback for models that don't support structured output
    const response = await model.invoke(formattedPrompt.toString());
    const responseText =
      typeof response.content === 'string'
        ? response.content.toLowerCase()
        : JSON.stringify(response.content).toLowerCase();

    // Simple text parsing to determine route
    if (
      responseText.includes('retrieve') ||
      responseText.includes('search') ||
      responseText.includes('document')
    ) {
      return { route: 'retrieve' };
    } else {
      return { route: 'direct' };
    }
  }
}

async function answerQueryDirectly(
  state: typeof AgentStateAnnotation.State,
  config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  const configuration = ensureAgentConfiguration(config);
  const userHumanMessage = new HumanMessage(state.query);

  // Check if we're using an Ollama model
  if (configuration.queryModel.startsWith('ollama/')) {
    // Use direct Ollama client
    const modelName = configuration.queryModel.replace('ollama/', '');
    const ollamaChat = new DirectOllamaChat({
      model: modelName,
      temperature: 0.1, // Slightly higher temperature for more natural responses
    });

    try {
      console.log('💬 Answering directly with Ollama model:', modelName);
      const response = await ollamaChat.invoke(state.query);
      return { messages: [userHumanMessage, response] };
    } catch (error) {
      console.error('❌ Direct Ollama answer failed:', error);
      throw error;
    }
  } else {
    // Use LangChain for non-Ollama models
    const model = await loadChatModel(configuration.queryModel);
    const response = await model.invoke([userHumanMessage]);
    return { messages: [userHumanMessage, response] };
  }
}

async function routeQuery(
  state: typeof AgentStateAnnotation.State,
): Promise<'retrieveDocuments' | 'directAnswer'> {
  const route = state.route;
  if (!route) {
    throw new Error('Route is not set');
  }

  if (route === 'retrieve') {
    return 'retrieveDocuments';
  } else if (route === 'direct') {
    return 'directAnswer';
  } else {
    throw new Error('Invalid route');
  }
}

async function retrieveDocuments(
  state: typeof AgentStateAnnotation.State,
  config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  const retriever = await makeRetriever(config);
  const response = await retriever.invoke(state.query);

  return { documents: response };
}

async function generateResponse(
  state: typeof AgentStateAnnotation.State,
  config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  const configuration = ensureAgentConfiguration(config);
  const context = formatDocs(state.documents);
  const promptTemplate = RESPONSE_SYSTEM_PROMPT;

  const formattedPrompt = await promptTemplate.invoke({
    question: state.query,
    context: context,
  });

  const userHumanMessage = new HumanMessage(state.query);

  // Check if we're using an Ollama model
  if (configuration.queryModel.startsWith('ollama/')) {
    // Use direct Ollama client
    const modelName = configuration.queryModel.replace('ollama/', '');
    const ollamaChat = new DirectOllamaChat({
      model: modelName,
      temperature: 0.1, // Slightly higher temperature for more natural responses
    });

    try {
      console.log(
        '🔍 Generating response with retrieved documents using Ollama model:',
        modelName,
      );
      console.log(
        '📄 Using context from',
        state.documents?.length || 0,
        'documents',
      );

      const response = await ollamaChat.invoke(formattedPrompt.toString());
      console.log(
        '✅ Direct Ollama response generated successfully:',
        response,
      );
      return { messages: [userHumanMessage, response] };
    } catch (error) {
      console.error('❌ Direct Ollama response generation failed:', error);
      throw error;
    }
  } else {
    // Use LangChain for non-Ollama models
    const model = await loadChatModel(configuration.queryModel);

    // Create a human message with the formatted prompt that includes context
    const formattedPromptMessage = new HumanMessage(formattedPrompt.toString());
    const messageHistory = [...state.messages, formattedPromptMessage];

    // Let MessagesAnnotation handle the message history
    const response = await model.invoke(messageHistory);

    // Return both the current query and the AI response to be handled by MessagesAnnotation's reducer
    return { messages: [userHumanMessage, response] };
  }
}

const builder = new StateGraph(
  AgentStateAnnotation,
  AgentConfigurationAnnotation,
)
  .addNode('retrieveDocuments', retrieveDocuments)
  .addNode('generateResponse', generateResponse)
  .addNode('checkQueryType', checkQueryType)
  .addNode('directAnswer', answerQueryDirectly)
  .addEdge(START, 'checkQueryType')
  .addConditionalEdges('checkQueryType', routeQuery, [
    'retrieveDocuments',
    'directAnswer',
  ])
  .addEdge('retrieveDocuments', 'generateResponse')
  .addEdge('generateResponse', END)
  .addEdge('directAnswer', END);

export const graph = builder.compile().withConfig({
  runName: 'RetrievalGraph',
});
