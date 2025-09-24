// Server-Sent Events endpoint for real-time job progress
import { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const { jobId } = params;

  if (!jobId) {
    return new Response('Job ID required', { status: 400 });
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder();

  const customReadable = new ReadableStream({
    async start(controller) {
      try {
        // Poll for job progress updates
        const pollInterval = setInterval(async () => {
          try {
            // Get job progress (would use BulkIngestionService here)
            const progress = await getJobProgress(jobId);

            if (!progress) {
              controller.enqueue(
                encoder.encode(
                  `event: error\ndata: ${JSON.stringify({ error: 'Job not found' })}\n\n`,
                ),
              );
              controller.close();
              clearInterval(pollInterval);
              return;
            }

            // Send progress update
            controller.enqueue(
              encoder.encode(
                `event: progress\ndata: ${JSON.stringify(progress)}\n\n`,
              ),
            );

            // Close stream when job is complete
            if (
              ['completed', 'failed', 'cancelled'].includes(progress.status)
            ) {
              controller.enqueue(
                encoder.encode(
                  `event: complete\ndata: ${JSON.stringify(progress)}\n\n`,
                ),
              );
              controller.close();
              clearInterval(pollInterval);
            }
          } catch (error) {
            console.error('Error polling job progress:', error);
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({
                  error: 'Failed to get progress',
                  details:
                    error instanceof Error ? error.message : 'Unknown error',
                })}\n\n`,
              ),
            );
            controller.close();
            clearInterval(pollInterval);
          }
        }, 2000); // Poll every 2 seconds

        // Handle client disconnect
        const cleanup = () => {
          clearInterval(pollInterval);
          controller.close();
        };

        // Cleanup on stream close
        request.signal.addEventListener('abort', cleanup);
      } catch (error) {
        console.error('SSE setup error:', error);
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: 'Setup failed' })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(customReadable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// Mock function - would be replaced with actual service call
async function getJobProgress(jobId: string) {
  // This would use the BulkIngestionService
  // For now, return mock data
  return {
    jobId,
    status: 'processing',
    progressPercentage: 45,
    processedFiles: 18,
    totalFiles: 40,
    currentFile: 'document-18.pdf',
    estimatedTimeRemaining: 120,
    fileDetails: [
      { filename: 'doc1.pdf', status: 'completed', chunksCreated: 15 },
      { filename: 'doc2.pdf', status: 'processing', chunksCreated: 0 },
      // ... more files
    ],
  };
}
