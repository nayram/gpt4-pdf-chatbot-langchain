/**
 * Test script to verify PostgreSQL vector store connection and functionality
 */

import dotenv from 'dotenv';
import { makeRetriever } from './src/shared/retrieval.js';

// Load environment variables
dotenv.config();

// Set test environment variables for PostgreSQL
process.env.POSTGRES_HOST = 'localhost';
process.env.POSTGRES_PORT = '5432';
process.env.POSTGRES_USER = 'postgres';
process.env.POSTGRES_PASSWORD = 'postgres';
process.env.POSTGRES_DB = 'pdf_chatbot';

async function testPostgresRetriever() {
  try {
    console.log('🔌 Testing PostgreSQL Vector Store Connection...\n');

    // Test configuration
    const testConfig = {
      configurable: {
        retrieverProvider: 'postgres',
        k: 3,
        filterKwargs: {},
      },
    };

    console.log(
      '📋 Configuration:',
      JSON.stringify(testConfig.configurable, null, 2),
    );

    // Try to create the retriever
    console.log('\n🚀 Creating PostgreSQL retriever...');
    const retriever = await makeRetriever(testConfig);

    console.log('✅ PostgreSQL retriever created successfully!');
    console.log('📊 Retriever type:', retriever.constructor.name);

    // Test a simple query (this will fail if no documents are indexed yet, but that's expected)
    console.log('\n🔍 Testing search functionality...');
    try {
      const results = await retriever.invoke('test query');
      console.log(`📄 Found ${results.length} documents`);
      if (results.length > 0) {
        console.log(
          '📝 First result preview:',
          results[0].pageContent.substring(0, 100) + '...',
        );
      }
    } catch (searchError) {
      console.log(
        '⚠️  Search test expected to fail (no documents indexed yet):',
        searchError.message,
      );
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(
      '🔧 Check your PostgreSQL connection and ensure the database is running',
    );

    // Provide debugging information
    console.log('\n🐛 Debug Information:');
    console.log('POSTGRES_HOST:', process.env.POSTGRES_HOST);
    console.log('POSTGRES_PORT:', process.env.POSTGRES_PORT);
    console.log('POSTGRES_USER:', process.env.POSTGRES_USER);
    console.log('POSTGRES_DB:', process.env.POSTGRES_DB);
    console.log('DATABASE_URL:', process.env.DATABASE_URL || 'Not set');
  }
}

// Run the test
testPostgresRetriever();
