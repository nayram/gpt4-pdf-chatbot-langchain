-- Enhanced schema for bulk ingestion support
-- Add to existing schema or run after 02-create-schema-optimized.sql

-- Ingestion jobs tracking table
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Job status and progress
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
    total_files INTEGER NOT NULL DEFAULT 0,
    processed_files INTEGER NOT NULL DEFAULT 0,
    successful_files INTEGER NOT NULL DEFAULT 0,
    failed_files INTEGER NOT NULL DEFAULT 0,
    total_chunks INTEGER NOT NULL DEFAULT 0,
    
    -- Timing information
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Configuration and metadata
    batch_size INTEGER DEFAULT 5,
    max_file_size BIGINT DEFAULT 10485760, -- 10MB in bytes
    job_metadata JSONB DEFAULT '{}',
    
    -- Error tracking
    error_message TEXT,
    
    -- User/session tracking (optional)
    session_id TEXT,
    
    -- Timestamps
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Individual file processing tracking
CREATE TABLE IF NOT EXISTS ingestion_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES ingestion_jobs(id) ON DELETE CASCADE,
    
    -- File information
    filename VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    file_hash TEXT, -- Optional: for duplicate detection
    
    -- Processing status
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')) DEFAULT 'pending',
    
    -- Results
    chunks_created INTEGER DEFAULT 0,
    embeddings_created INTEGER DEFAULT 0,
    
    -- Timing
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 2,
    
    -- Metadata
    file_metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON ingestion_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_created_at ON ingestion_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_session ON ingestion_jobs(session_id);

CREATE INDEX IF NOT EXISTS idx_ingestion_files_job_id ON ingestion_files(job_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_files_status ON ingestion_files(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_files_filename ON ingestion_files(filename);

-- Update trigger for ingestion_jobs
CREATE TRIGGER update_ingestion_jobs_updated_at BEFORE UPDATE ON ingestion_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update trigger for ingestion_files
CREATE TRIGGER update_ingestion_files_updated_at BEFORE UPDATE ON ingestion_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update job progress automatically
CREATE OR REPLACE FUNCTION update_job_progress()
RETURNS TRIGGER AS $$
BEGIN
    -- Update job statistics when a file status changes
    UPDATE ingestion_jobs SET
        processed_files = (
            SELECT COUNT(*) 
            FROM ingestion_files 
            WHERE job_id = NEW.job_id 
            AND status IN ('completed', 'failed')
        ),
        successful_files = (
            SELECT COUNT(*) 
            FROM ingestion_files 
            WHERE job_id = NEW.job_id 
            AND status = 'completed'
        ),
        failed_files = (
            SELECT COUNT(*) 
            FROM ingestion_files 
            WHERE job_id = NEW.job_id 
            AND status = 'failed'
        ),
        total_chunks = (
            SELECT COALESCE(SUM(chunks_created), 0)
            FROM ingestion_files 
            WHERE job_id = NEW.job_id 
            AND status = 'completed'
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.job_id;
    
    -- Auto-update job status based on file completion
    UPDATE ingestion_jobs SET
        status = CASE
            WHEN processed_files >= total_files AND failed_files = 0 THEN 'completed'
            WHEN processed_files >= total_files AND failed_files > 0 THEN 'completed'
            ELSE status
        END,
        completed_at = CASE
            WHEN processed_files >= total_files THEN CURRENT_TIMESTAMP
            ELSE completed_at
        END
    WHERE id = NEW.job_id AND status = 'processing';
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update job progress when file status changes
CREATE TRIGGER update_job_progress_trigger
    AFTER UPDATE OF status, chunks_created ON ingestion_files
    FOR EACH ROW
    EXECUTE FUNCTION update_job_progress();

-- View for job progress with detailed statistics
CREATE OR REPLACE VIEW ingestion_job_progress AS
SELECT 
    j.id,
    j.status,
    j.total_files,
    j.processed_files,
    j.successful_files,
    j.failed_files,
    j.total_chunks,
    j.created_at,
    j.started_at,
    j.completed_at,
    j.session_id,
    
    -- Progress percentage
    CASE 
        WHEN j.total_files > 0 THEN ROUND((j.processed_files::FLOAT / j.total_files::FLOAT) * 100, 2)
        ELSE 0 
    END as progress_percentage,
    
    -- Processing time
    CASE 
        WHEN j.completed_at IS NOT NULL AND j.started_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (j.completed_at - j.started_at))
        WHEN j.started_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - j.started_at))
        ELSE NULL 
    END as processing_duration_seconds,
    
    -- File breakdown
    (
        SELECT json_agg(
            json_build_object(
                'filename', f.filename,
                'status', f.status,
                'chunks_created', f.chunks_created,
                'error_message', f.error_message,
                'processing_duration', 
                CASE 
                    WHEN f.processing_completed_at IS NOT NULL AND f.processing_started_at IS NOT NULL
                    THEN EXTRACT(EPOCH FROM (f.processing_completed_at - f.processing_started_at))
                    ELSE NULL
                END
            )
        )
        FROM ingestion_files f 
        WHERE f.job_id = j.id
    ) as file_details
    
FROM ingestion_jobs j;

-- Function to clean up old completed jobs (optional maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_ingestion_jobs(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM ingestion_jobs 
    WHERE status IN ('completed', 'failed', 'cancelled') 
    AND completed_at < CURRENT_TIMESTAMP - INTERVAL '1 day' * days_old;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;