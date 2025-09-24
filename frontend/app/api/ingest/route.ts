// app/api/ingest/route.ts
import { indexConfig } from '@/constants/graphConfigs';
import { langGraphServerClient } from '@/lib/langgraph-server';
import { processPDF } from '@/lib/pdf';
import { Document } from '@langchain/core/documents';
import { NextRequest, NextResponse } from 'next/server';

// Configuration constants - QUICK SOLUTION: Increased limits
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB (increased from 10MB)
const ALLOWED_FILE_TYPES = ['application/pdf'];
const MAX_FILES_PER_JOB = 40; // QUICK SOLUTION: Increased from 5

// QUICK SOLUTION: Helper functions for batch processing
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

async function processBatch(files: File[]): Promise<Document[]> {
  console.log(`Processing batch of ${files.length} files concurrently...`);

  const promises = files.map(async (file) => {
    try {
      const startTime = Date.now();
      const docs = await processPDF(file);
      const duration = Date.now() - startTime;
      console.log(
        `✅ Processed ${file.name}: ${docs.length} documents (${duration}ms)`,
      );
      return docs;
    } catch (error) {
      console.error(`❌ Error processing ${file.name}:`, error);
      return []; // Return empty array for failed files - continue processing others
    }
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
      console.error(
        `❌ Batch processing failed for ${files[index].name}:`,
        result.reason,
      );
    }
  });

  console.log(
    `Batch completed: ${successCount} succeeded, ${failCount} failed, ${allDocs.length} total documents`,
  );
  return allDocs;
}

// Helper function to extract files from FormData
function extractFilesFromFormData(formData: FormData): File[] {
  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    // Check if it's a file by checking for file properties instead of instanceof
    if (
      key === 'files' &&
      value &&
      typeof value === 'object' &&
      'name' in value &&
      'size' in value &&
      'type' in value
    ) {
      files.push(value);
    }
  }
  return files;
}

// Helper function to validate files
function validateFiles(files: File[]): NextResponse | null {
  if (!files || files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  if (files.length > MAX_FILES_PER_JOB) {
    return NextResponse.json(
      {
        error: `Too many files. Maximum ${MAX_FILES_PER_JOB} files allowed per job.`,
        maxFiles: MAX_FILES_PER_JOB,
        receivedFiles: files.length,
      },
      { status: 400 },
    );
  }

  const invalidFiles = files.filter((file) => {
    return !ALLOWED_FILE_TYPES.includes(file.type) || file.size > MAX_FILE_SIZE;
  });

  if (invalidFiles.length > 0) {
    return NextResponse.json(
      {
        error:
          'Only PDF files are allowed and file size must be less than 20MB',
      },
      { status: 400 },
    );
  }

  return null; // No validation errors
}

// Helper function to process all file batches
async function processAllBatches(files: File[]) {
  const startTime = Date.now();
  console.log(`🚀 Starting bulk ingestion of ${files.length} files...`);

  const batchSize = Math.min(5, files.length);
  const fileBatches = chunkArray(files, batchSize);
  const allDocs: Document[] = [];
  let totalSuccessfulFiles = 0;
  let totalFailedFiles = 0;

  for (let i = 0; i < fileBatches.length; i++) {
    const batch = fileBatches[i];
    console.log(
      `📦 Processing batch ${i + 1}/${fileBatches.length} (${batch.length} files)...`,
    );

    const batchDocs = await processBatch(batch);
    allDocs.push(...batchDocs);

    // Count successful vs failed files in this batch
    const batchSuccessCount = batch.filter((_, idx) => {
      return batchDocs.some((doc) => doc.metadata.filename === batch[idx].name);
    }).length;

    totalSuccessfulFiles += batchSuccessCount;
    totalFailedFiles += batch.length - batchSuccessCount;

    console.log(
      `✅ Batch ${i + 1} completed. Documents so far: ${allDocs.length}`,
    );

    // Add small delay between batches to prevent system overload
    if (i < fileBatches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const processingTimeSeconds = Math.round((Date.now() - startTime) / 1000);

  return {
    allDocs,
    totalSuccessfulFiles,
    totalFailedFiles,
    processingTimeSeconds,
    batchSize,
    totalBatches: fileBatches.length,
  };
}

// Helper function to run ingestion graph
async function runIngestionGraph(allDocs: Document[]) {
  const thread = await langGraphServerClient.createThread();
  await langGraphServerClient.client.runs.wait(
    thread.thread_id,
    'ingestion_graph',
    {
      input: {
        docs: allDocs,
      },
      config: {
        configurable: {
          ...indexConfig,
        },
      },
    },
  );
  return thread.thread_id;
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.LANGGRAPH_INGESTION_ASSISTANT_ID) {
      return NextResponse.json(
        {
          error:
            'LANGGRAPH_INGESTION_ASSISTANT_ID is not set in your environment variables',
        },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const files = extractFilesFromFormData(formData);

    // Validate files
    const validationError = validateFiles(files);
    if (validationError) {
      return validationError;
    }

    console.log(`📁 ${files.length} files received for processing`);

    // Process all files in batches
    const result = await processAllBatches(files);

    const {
      allDocs,
      totalSuccessfulFiles,
      totalFailedFiles,
      processingTimeSeconds,
      batchSize,
      totalBatches,
    } = result;

    console.log(
      `📊 Processing complete: ${allDocs.length} documents from ${totalSuccessfulFiles}/${files.length} files`,
    );

    if (!allDocs.length) {
      return NextResponse.json(
        {
          error: 'No valid documents extracted from uploaded files',
          details: `All ${files.length} files failed processing. Check server logs for details.`,
          statistics: {
            totalFiles: files.length,
            successfulFiles: totalSuccessfulFiles,
            failedFiles: totalFailedFiles,
            documentsExtracted: 0,
          },
        },
        { status: 500 },
      );
    }

    console.log(
      `📊 Processing complete: ${allDocs.length} documents from ${totalSuccessfulFiles}/${files.length} files`,
    );

    // Run the ingestion graph
    const threadId = await runIngestionGraph(allDocs);

    // Enhanced success response with statistics
    return NextResponse.json({
      success: true,
      message: 'Bulk ingestion completed successfully',
      threadId,
      statistics: {
        totalFiles: files.length,
        successfulFiles: totalSuccessfulFiles,
        failedFiles: totalFailedFiles,
        documentsExtracted: allDocs.length,
        averageDocsPerFile:
          totalSuccessfulFiles > 0
            ? Math.round((allDocs.length / totalSuccessfulFiles) * 100) / 100
            : 0,
        processingTimeSeconds,
        batchesProcessed: totalBatches,
      },
      performance: {
        batchSize,
        totalBatches,
        documentsPerSecond:
          processingTimeSeconds > 0
            ? Math.round((allDocs.length / processingTimeSeconds) * 100) / 100
            : 0,
      },
    });
  } catch (error: unknown) {
    console.error('Error processing files:', error);
    return NextResponse.json(
      {
        error: 'Failed to process files',
        details:
          error instanceof Error
            ? error.message
            : 'Unknown error occurred during bulk processing',
      },
      { status: 500 },
    );
  }
}
