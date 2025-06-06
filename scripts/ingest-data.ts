import { PineconeStore } from '@langchain/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { pinecone } from '@/utils/pinecone-client';
import { CustomPDFLoader } from '@/utils/customPDFLoader';
import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from '@/config/pinecone';


const filePath = 'docs';

export const run = async () => {
  try {
    
    const directoryLoader = new DirectoryLoader(filePath, {
      '.pdf': (path) => new CustomPDFLoader(path),
    });

    
    const rawDocs = await directoryLoader.load();

    
    
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 400,
    });

    const docs = await textSplitter.splitDocuments(rawDocs);
    console.log(`Split docs into ${docs.length} chunks`);

    console.log('creating vector store...');
    
    const embeddings = new OpenAIEmbeddings({
      batchSize: 50,
    });
    const index = pinecone.Index(PINECONE_INDEX_NAME);

    // Process documents in smaller batches to avoid rate limiting
    await PineconeStore.fromDocuments(docs, embeddings, {
      pineconeIndex: index,
      namespace: PINECONE_NAME_SPACE,
      textKey: 'text',
    });
  } catch (error: any) {
    console.error('An error occurred during data ingestion:');

    if (error.response?.status === 429) {
      console.error(
        'OpenAI API rate limit exceeded. Try:\n' +
          '1. Increasing the delay between batches\n' +
          '2. Reducing the batch size\n' +
          '3. Waiting a few minutes before retrying',
      );
    } else if (error.code === 'ENOENT') {
      console.error(
        `File system error: Could not find directory or file at '${filePath}'`,
      );
    } else if (error.message?.includes('Pinecone')) {
      console.error('Pinecone database error:', error.message);
    } else {
      console.error('Unexpected error:', error.message || error);
      
      console.debug('Full error details:', JSON.stringify(error, null, 2));
    }

    throw new Error(
      `Failed to ingest your data: ${error.message || 'Unknown error'}`,
    );
  }
};

(async () => {
  try {
    await run();
    console.log('Ingestion complete');
  } catch (error) {
    
    process.exit(1);
  }
})();
