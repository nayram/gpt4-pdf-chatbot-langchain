# Enhanced Ingestion Implementation Plan

## 🎯 Goals

- Support 40+ files simultaneously
- Resilient to failures (partial success handling)
- Progress tracking and user feedback
- Memory efficient processing
- Parallel processing where possible
- Proper error handling and recovery

## 🏗️ Architecture Improvements

### 1. **Batch Processing System**

- Process files in configurable batches (e.g., 5 files at a time)
- Queue-based approach for large uploads
- Parallel PDF processing within batches

### 2. **Enhanced Database Schema**

- Add ingestion job tracking table
- Track individual file processing status
- Support for batch operations with rollback

### 3. **Progress Tracking API**

- Real-time progress updates via Server-Sent Events (SSE)
- Detailed status per file (pending, processing, completed, failed)
- Estimated time remaining

### 4. **Error Handling & Recovery**

- Retry failed files automatically
- Continue processing on individual file failures
- Partial success reporting
- Cleanup of failed ingestions

### 5. **Memory Management**

- Stream processing for large files
- Chunk documents and process in smaller batches
- Garbage collection between batches

## 🔧 Implementation Components

### Database Enhancements

```sql
-- Job tracking table
CREATE TABLE ingestion_jobs (
    id UUID PRIMARY KEY,
    status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    total_files INTEGER,
    processed_files INTEGER,
    failed_files INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT
);

-- File processing tracking
CREATE TABLE ingestion_files (
    id UUID PRIMARY KEY,
    job_id UUID REFERENCES ingestion_jobs(id),
    filename VARCHAR(255),
    file_size INTEGER,
    status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    chunks_created INTEGER DEFAULT 0,
    error_message TEXT,
    processing_start TIMESTAMP,
    processing_end TIMESTAMP
);
```

### API Enhancements

- `/api/ingest/upload` - Start bulk ingestion job
- `/api/ingest/status/:jobId` - Get job progress
- `/api/ingest/stream/:jobId` - SSE progress stream
- `/api/ingest/cancel/:jobId` - Cancel ongoing job

### Configuration

- `MAX_FILES_PER_BATCH: 40` (increased from 5)
- `BATCH_SIZE: 5` (process 5 files simultaneously)
- `MAX_CONCURRENT_JOBS: 3`
- `RETRY_ATTEMPTS: 2`
- `TIMEOUT_PER_FILE: 300000` (5 minutes)

## 📈 Expected Performance

- **40 files**: ~10-15 minutes (vs 30+ minutes sequential)
- **Memory usage**: Constant ~200MB (vs potentially 2GB+)
- **Failure resilience**: 95%+ success rate with retries
- **User experience**: Real-time progress, cancellation support

## 🎛️ Configuration Options

- Batch processing size
- Concurrent processing limit
- Timeout settings
- Retry policies
- Memory limits per batch
