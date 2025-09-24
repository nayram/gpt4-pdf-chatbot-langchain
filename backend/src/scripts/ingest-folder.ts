#!/usr/bin/env tsx

/**
 * Batch Ingestion Script for Documents in a Folder
 *
 * This script processes all PDF documents in a specified folder and ingests them
 * into the vector database using the same pipeline as the frontend upload.
 *
 * Usage:
 *   npx tsx src/scripts/ingest-folder.ts [options]
 *
 * Options:
 *   --folder <path>        Path to folder containing PDF documents (required)
 *   --batch-size <number>  Number of files to process concurrently (default: 5)
 *   --recursive           Process subdirectories recursively (default: false)
 *   --dry-run             Show what files would be processed without actually ingesting
 *   --help                Show this help message
 *
 * Examples:
 *   npx tsx src/scripts/ingest-folder.ts --folder ./documents
 *   npx tsx src/scripts/ingest-folder.ts --folder ./docs --batch-size 3 --recursive
 *   npx tsx src/scripts/ingest-folder.ts --folder ./pdfs --dry-run
 */

import fs from 'fs/promises';
import path from 'path';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { Document } from '@langchain/core/documents';
import { makeRetriever } from '../shared/retrieval.js';

// Configuration
interface IngestOptions {
  folder: string;
  batchSize: number;
  recursive: boolean;
  dryRun: boolean;
  help: boolean;
}

const DEFAULT_OPTIONS: IngestOptions = {
  folder: '',
  batchSize: 5,
  recursive: false,
  dryRun: false,
  help: false,
};

// Helper functions
function printHelp(): void {
  console.log(`
Batch Ingestion Script for Documents in a Folder

This script processes all PDF documents in a specified folder and ingests them
into the vector database using the same pipeline as the frontend upload.

Usage:
  npx tsx src/scripts/ingest-folder.ts [options]

Options:
  --folder <path>        Path to folder containing PDF documents (required)
  --batch-size <number>  Number of files to process concurrently (default: 5)
  --recursive           Process subdirectories recursively (default: false)
  --dry-run             Show what files would be processed without actually ingesting
  --help                Show this help message

Examples:
  npx tsx src/scripts/ingest-folder.ts --folder ./documents
  npx tsx src/scripts/ingest-folder.ts --folder ./docs --batch-size 3 --recursive
  npx tsx src/scripts/ingest-folder.ts --folder ./pdfs --dry-run
  `);
}

function parseArguments(): IngestOptions {
  const args = process.argv.slice(2);
  const options = { ...DEFAULT_OPTIONS };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--folder':
      case '-f':
        if (i + 1 < args.length) {
          options.folder = args[i + 1];
          i++; // Skip next argument as it's the folder path
        } else {
          throw new Error('--folder requires a path argument');
        }
        break;
      case '--batch-size':
      case '-b':
        if (i + 1 < args.length) {
          const batchSize = parseInt(args[i + 1], 10);
          if (isNaN(batchSize) || batchSize < 1) {
            throw new Error('--batch-size must be a positive number');
          }
          options.batchSize = batchSize;
          i++; // Skip next argument as it's the batch size
        } else {
          throw new Error('--batch-size requires a number argument');
        }
        break;
      case '--recursive':
      case '-r':
        options.recursive = true;
        break;
      case '--dry-run':
      case '-d':
        options.dryRun = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
    i++;
  }

  return options;
}

async function findPDFFiles(
  folderPath: string,
  recursive: boolean = false,
): Promise<string[]> {
  const pdfFiles: string[] = [];

  async function scanDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
          pdfFiles.push(fullPath);
        } else if (entry.isDirectory() && recursive) {
          await scanDirectory(fullPath);
        }
      }
    } catch (error) {
      console.warn(`⚠️  Could not read directory ${dirPath}:`, error.message);
    }
  }

  await scanDirectory(folderPath);
  return pdfFiles.sort((a, b) => a.localeCompare(b));
}

async function processPDFFile(filePath: string): Promise<Document[]> {
  try {
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();

    // Add filename and file path to metadata
    const fileName = path.basename(filePath);
    const relativePath = path.relative(process.cwd(), filePath);

    docs.forEach((doc) => {
      doc.metadata.filename = fileName;
      doc.metadata.filePath = relativePath;
      doc.metadata.source = filePath;
    });

    return docs;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return [];
  }
}

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

async function processBatch(
  filePaths: string[],
  batchNumber: number,
  totalBatches: number,
): Promise<Document[]> {
  console.log(
    `📦 Processing batch ${batchNumber}/${totalBatches} (${filePaths.length} files)...`,
  );

  const promises = filePaths.map(async (filePath) => {
    const startTime = Date.now();
    const docs = await processPDFFile(filePath);
    const duration = Date.now() - startTime;

    const fileName = path.basename(filePath);
    if (docs.length > 0) {
      console.log(
        `✅ Processed ${fileName}: ${docs.length} documents (${duration}ms)`,
      );
    } else {
      console.log(`⚠️  Failed to process ${fileName} (${duration}ms)`);
    }

    return docs;
  });

  const results = await Promise.allSettled(promises);
  const allDocs: Document[] = [];
  let successCount = 0;
  let failCount = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      allDocs.push(...result.value);
      if (result.value.length > 0) {
        successCount++;
      } else {
        failCount++;
      }
    } else {
      failCount++;
      const fileName = path.basename(filePaths[index]);
      console.error(
        `❌ Batch processing failed for ${fileName}:`,
        result.reason,
      );
    }
  });

  console.log(
    `📊 Batch ${batchNumber} results: ${successCount} success, ${failCount} failed, ${allDocs.length} total documents`,
  );
  return allDocs;
}

async function ingestDocuments(docs: Document[]): Promise<void> {
  if (docs.length === 0) {
    console.log('⚠️  No documents to ingest');
    return;
  }

  console.log(`🔄 Ingesting ${docs.length} documents into vector database...`);

  try {
    // Create a mock RunnableConfig with the required configuration
    const config = {
      configurable: {
        retrieverProvider: process.env.RETRIEVER_PROVIDER || 'postgres',
        k: 4,
        filterKwargs: {},
      },
    };

    const retriever = await makeRetriever(config);
    const startTime = Date.now();

    await retriever.addDocuments(docs);

    const duration = Date.now() - startTime;
    console.log(
      `✅ Successfully ingested ${docs.length} documents (${duration}ms)`,
    );
  } catch (error) {
    console.error('❌ Failed to ingest documents:', error);
    throw error;
  }
}

async function main(): Promise<void> {
  try {
    const options = parseArguments();

    if (options.help) {
      printHelp();
      return;
    }

    if (!options.folder) {
      console.error('❌ Error: --folder is required');
      console.error('Run with --help for usage information');
      process.exit(1);
    }

    // Validate folder exists
    const folderPath = path.resolve(options.folder);
    try {
      await fs.access(folderPath);
      const stat = await fs.stat(folderPath);
      if (!stat.isDirectory()) {
        throw new Error(`Path ${folderPath} is not a directory`);
      }
    } catch (error) {
      console.error(
        `❌ Error: Cannot access folder ${folderPath}:`,
        error.message,
      );
      process.exit(1);
    }

    console.log(`🔍 Scanning for PDF files in: ${folderPath}`);
    console.log(`   Recursive: ${options.recursive ? 'Yes' : 'No'}`);
    console.log(`   Batch size: ${options.batchSize}`);
    console.log(`   Dry run: ${options.dryRun ? 'Yes' : 'No'}`);
    console.log('');

    // Find all PDF files
    const pdfFiles = await findPDFFiles(folderPath, options.recursive);

    if (pdfFiles.length === 0) {
      console.log('⚠️  No PDF files found in the specified folder');
      return;
    }

    console.log(`📁 Found ${pdfFiles.length} PDF files:`);
    pdfFiles.forEach((file, index) => {
      const relativePath = path.relative(process.cwd(), file);
      console.log(`   ${index + 1}. ${relativePath}`);
    });
    console.log('');

    if (options.dryRun) {
      console.log('🏃‍♂️ Dry run complete - no files were processed');
      return;
    }

    // Process files in batches
    const batches = chunkArray(pdfFiles, options.batchSize);
    const allDocuments: Document[] = [];
    let totalFiles = 0;
    let successFiles = 0;

    console.log(`🚀 Starting batch processing (${batches.length} batches)...`);
    console.log('');

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchDocs = await processBatch(batch, i + 1, batches.length);

      allDocuments.push(...batchDocs);
      totalFiles += batch.length;

      // Count successful files in this batch
      const batchSuccessCount = batch.filter((filePath) =>
        batchDocs.some(
          (doc) =>
            doc.metadata.filePath === path.relative(process.cwd(), filePath),
        ),
      ).length;
      successFiles += batchSuccessCount;

      console.log('');
    }

    console.log(`📊 Processing Summary:`);
    console.log(`   Total files: ${totalFiles}`);
    console.log(`   Successful: ${successFiles}`);
    console.log(`   Failed: ${totalFiles - successFiles}`);
    console.log(`   Documents extracted: ${allDocuments.length}`);
    console.log('');

    // Ingest all documents into vector database
    if (allDocuments.length > 0) {
      await ingestDocuments(allDocuments);
      console.log('');
      console.log('🎉 Batch ingestion completed successfully!');
    } else {
      console.log('⚠️  No documents were successfully processed');
    }
  } catch (error) {
    if (
      error.message.includes('Unknown option') ||
      error.message.includes('requires')
    ) {
      console.error(`❌ ${error.message}`);
      console.error('Run with --help for usage information');
      process.exit(1);
    } else {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    }
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((error) => {
      console.error('❌ Unhandled error:', error);
      process.exit(1);
    })
    .then(() => {
      console.log('👋 Exiting');
      setTimeout(() => {
        console.log('🛑 Goodbye!');
        process.exit(0);
      }, 1000); // Wait a moment for logs to flush
    });
}
