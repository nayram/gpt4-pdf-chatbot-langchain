import { loadChatModel } from './src/shared/utils.js';

async function testOllamaChatModel() {
  console.log('Testing Ollama chat model...');

  try {
    // Test loading the chat model
    const chatModel = await loadChatModel('ollama/llama3.2', 0.1);
    console.log('✅ Chat model loaded successfully');

    // Test a simple chat interaction
    const response = await chatModel.invoke([
      {
        role: 'user',
        content: 'Hello! Please respond with just "Hello from Ollama!"',
      },
    ]);

    console.log('✅ Chat model response:', response.content);
    console.log('🎉 Ollama chat model is working correctly!');
  } catch (error) {
    console.error('❌ Error testing Ollama chat model:', error);
    console.log('\n📝 Troubleshooting tips:');
    console.log('1. Make sure Ollama is running: ollama serve');
    console.log('2. Make sure the model is installed: ollama pull llama3.2');
    console.log(
      '3. Check if Ollama is accessible: curl http://localhost:11434/api/tags',
    );
  }
}

// Run the test
testOllamaChatModel();
