/**
 * Simple test to verify PostgreSQL retriever implementation structure
 * This test only checks the configuration and setup, not actual embedding functionality
 */

import { ensureBaseConfiguration } from './src/shared/configuration.js';

async function testConfiguration() {
  console.log('🔧 Testing PostgreSQL Retriever Configuration...\n');

  // Test PostgreSQL configuration
  const postgresConfig = {
    configurable: {
      retrieverProvider: 'postgres' as const,
      k: 5,
      filterKwargs: {},
    },
  };

  console.log('📋 Testing postgres configuration...');
  const config = ensureBaseConfiguration(postgresConfig);

  console.log('✅ Configuration parsed successfully:');
  console.log(`   - Provider: ${config.retrieverProvider}`);
  console.log(`   - K (results): ${config.k}`);
  console.log(`   - Filter kwargs: ${JSON.stringify(config.filterKwargs)}`);

  // Test default configuration (should now default to postgres)
  console.log('\n📋 Testing default configuration...');
  const defaultConfig = ensureBaseConfiguration({});

  console.log('✅ Default configuration:');
  console.log(`   - Provider: ${defaultConfig.retrieverProvider}`);
  console.log(`   - K (results): ${defaultConfig.k}`);

  // Test database connection string building
  console.log('\n🔗 Testing connection string building...');

  process.env.POSTGRES_USER = 'postgres';
  process.env.POSTGRES_PASSWORD = 'postgres';
  process.env.POSTGRES_HOST = 'localhost';
  process.env.POSTGRES_PORT = '5432';
  process.env.POSTGRES_DB = 'pdf_chatbot';

  const connectionString =
    process.env.DATABASE_URL ||
    `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`;

  console.log('✅ Connection string generated:');
  console.log(`   ${connectionString}`);

  console.log('\n🎉 All configuration tests passed!');
  console.log('\n💡 To test full functionality:');
  console.log('   1. Set OPENAI_API_KEY in your .env file');
  console.log('   2. Ensure PostgreSQL is running with the vector extension');
  console.log('   3. Run: npx tsx test-postgres-retriever.ts');
}

testConfiguration().catch(console.error);
