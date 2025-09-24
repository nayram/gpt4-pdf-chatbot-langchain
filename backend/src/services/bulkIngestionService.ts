import { Document } from '@langchain/core/documents';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

export interface IngestionJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalFiles: number;
  processedFiles: number;
  successfulFiles: number;
  failedFiles: number;
  totalChunks: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  sessionId?: string;
}

export interface IngestionFile {
  id: string;
  jobId: string;
  filename: string;
  fileSize: number;
  fileHash?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  chunksCreated: number;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
}

export interface IngestionProgress {
  jobId: string;
  status: string;
  progressPercentage: number;
  processedFiles: number;
  totalFiles: number;
  currentFile?: string;
  estimatedTimeRemaining?: number;
  fileDetails: Array<{
    filename: string;
    status: string;
    chunksCreated: number;
    errorMessage?: string;
  }>;
}

export class BulkIngestionService {
  private db: any; // PostgreSQL connection
  private batchSize: number;
  private maxRetries: number;

  constructor(config: {
    db: any;
    maxConcurrentFiles?: number;
    batchSize?: number;
    maxRetries?: number;
    timeoutPerFile?: number;
  }) {
    this.db = config.db;
    this.batchSize = config.batchSize ?? 5;
    this.maxRetries = config.maxRetries ?? 2;
  }

  /**
   * Start a new bulk ingestion job
   */
  async startIngestionJob(
    files: File[],
    sessionId?: string,
    options?: {
      batchSize?: number;
      maxRetries?: number;
    },
  ): Promise<string> {
    const jobId = uuidv4();

    // Create job record
    await this.db.query(
      `
      INSERT INTO ingestion_jobs (
        id, total_files, session_id, batch_size, status
      ) VALUES ($1, $2, $3, $4, 'pending')
    `,
      [jobId, files.length, sessionId, options?.batchSize ?? this.batchSize],
    );

    // Create file records
    const filePromises = files.map(async (file, index) => {
      const fileId = uuidv4();
      const fileHash = await this.calculateFileHash(file);

      await this.db.query(
        `
        INSERT INTO ingestion_files (
          id, job_id, filename, file_size, file_hash, max_retries
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [
          fileId,
          jobId,
          file.name,
          file.size,
          fileHash,
          options?.maxRetries ?? this.maxRetries,
        ],
      );
    });

    await Promise.all(filePromises);

    // Start processing in background
    this.processJobAsync(jobId, files);

    return jobId;
  }

  /**
   * Get job progress
   */
  async getJobProgress(jobId: string): Promise<IngestionProgress | null> {
    const result = await this.db.query(
      `
      SELECT * FROM ingestion_job_progress WHERE id = $1
    `,
      [jobId],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      jobId: row.id,
      status: row.status,
      progressPercentage: row.progress_percentage,
      processedFiles: row.processed_files,
      totalFiles: row.total_files,
      estimatedTimeRemaining: this.calculateEstimatedTime(row),
      fileDetails: row.file_details || [],
    };
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const result = await this.db.query(
      `
      UPDATE ingestion_jobs 
      SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND status IN ('pending', 'processing')
    `,
      [jobId],
    );

    return result.rowCount > 0;
  }

  /**
   * Process job asynchronously
   */
  private async processJobAsync(jobId: string, files: File[]): Promise<void> {
    try {
      // Update job status to processing
      await this.db.query(
        `
        UPDATE ingestion_jobs 
        SET status = 'processing', started_at = CURRENT_TIMESTAMP 
        WHERE id = $1
      `,
        [jobId],
      );

      // Process files in batches
      const batches = this.createBatches(files, this.batchSize);

      for (const batch of batches) {
        // Check if job was cancelled
        const jobStatus = await this.getJobStatus(jobId);
        if (jobStatus === 'cancelled') {
          break;
        }

        await this.processBatch(jobId, batch);
      }
    } catch (error) {
      console.error(`Error processing job ${jobId}:`, error);
      await this.db.query(
        `
        UPDATE ingestion_jobs 
        SET status = 'failed', error_message = $2, completed_at = CURRENT_TIMESTAMP 
        WHERE id = $1
      `,
        [jobId, error instanceof Error ? error.message : 'Unknown error'],
      );
    }
  }

  /**
   * Process a batch of files concurrently
   */
  private async processBatch(jobId: string, files: File[]): Promise<void> {
    const promises = files.map((file) => this.processFile(jobId, file));
    await Promise.allSettled(promises);
  }

  /**
   * Process individual file with retry logic
   */
  private async processFile(jobId: string, file: File): Promise<void> {
    const fileRecord = await this.getFileRecord(jobId, file.name);
    if (!fileRecord) return;

    let attempt = 0;

    while (attempt <= fileRecord.maxRetries) {
      try {
        // Update file status
        await this.updateFileStatus(fileRecord.id, 'processing');

        // Process PDF and create documents
        const documents = await this.processPDFFile(file);

        if (documents.length === 0) {
          throw new Error('No documents extracted from PDF');
        }

        // Add documents to vector store
        const chunksCreated = await this.addDocumentsToVectorStore(documents);

        // Update success status
        await this.db.query(
          `
          UPDATE ingestion_files 
          SET status = 'completed', 
              chunks_created = $2,
              processing_completed_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
          [fileRecord.id, chunksCreated],
        );

        return; // Success, exit retry loop
      } catch (error) {
        attempt++;
        console.error(
          `Error processing file ${file.name} (attempt ${attempt}):`,
          error,
        );

        if (attempt > fileRecord.maxRetries) {
          // Final failure
          await this.db.query(
            `
            UPDATE ingestion_files 
            SET status = 'failed', 
                error_message = $2, 
                retry_count = $3,
                processing_completed_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `,
            [
              fileRecord.id,
              error instanceof Error ? error.message : 'Unknown error',
              attempt - 1,
            ],
          );
        } else {
          // Will retry
          await this.db.query(
            `
            UPDATE ingestion_files SET retry_count = $2 WHERE id = $1
          `,
            [fileRecord.id, attempt],
          );

          // Wait before retry (exponential backoff)
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }
  }

  /**
   * Helper methods
   */
  private async calculateFileHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    return createHash('sha256').update(Buffer.from(buffer)).digest('hex');
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async getJobStatus(jobId: string): Promise<string> {
    const result = await this.db.query(
      `
      SELECT status FROM ingestion_jobs WHERE id = $1
    `,
      [jobId],
    );
    return result.rows[0]?.status;
  }

  private async getFileRecord(
    jobId: string,
    filename: string,
  ): Promise<IngestionFile | null> {
    const result = await this.db.query(
      `
      SELECT * FROM ingestion_files WHERE job_id = $1 AND filename = $2
    `,
      [jobId, filename],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      jobId: row.job_id,
      filename: row.filename,
      fileSize: row.file_size,
      fileHash: row.file_hash,
      status: row.status,
      chunksCreated: row.chunks_created,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
    };
  }

  private async updateFileStatus(
    fileId: string,
    status: string,
  ): Promise<void> {
    const startedAt =
      status === 'processing' ? 'CURRENT_TIMESTAMP' : 'processing_started_at';

    await this.db.query(
      `
      UPDATE ingestion_files 
      SET status = $2, processing_started_at = ${startedAt}
      WHERE id = $1
    `,
      [fileId, status],
    );
  }

  private async processPDFFile(file: File): Promise<Document[]> {
    // This would use the existing PDF processing logic
    // from frontend/lib/pdf.ts but adapted for server-side
    throw new Error('PDF processing not implemented in this example');
  }

  private async addDocumentsToVectorStore(
    documents: Document[],
  ): Promise<number> {
    // This would use the existing retriever.addDocuments logic
    // Return number of chunks created
    throw new Error('Vector store integration not implemented in this example');
  }

  private calculateEstimatedTime(jobData: any): number | undefined {
    if (!jobData.started_at || jobData.processed_files === 0) return undefined;

    const elapsedMs = Date.now() - new Date(jobData.started_at).getTime();
    const avgTimePerFile = elapsedMs / jobData.processed_files;
    const remainingFiles = jobData.total_files - jobData.processed_files;

    return Math.round((remainingFiles * avgTimePerFile) / 1000); // seconds
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
