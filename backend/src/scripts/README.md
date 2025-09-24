# Batch Document Ingestion Script

This script provides an alternative to the frontend document upload by allowing you to ingest PDF documents directly from a folder on your file system.

## Features

- **Batch Processing**: Process multiple PDF files concurrently
- **Recursive Scanning**: Optionally scan subdirectories
- **Progress Tracking**: Real-time progress updates and statistics
- **Error Handling**: Continues processing even if individual files fail
- **Dry Run Mode**: Preview what files would be processed without actually ingesting
- **Metadata Preservation**: Maintains file paths and names in document metadata

## Usage

### Basic Usage

```bash
# Process all PDFs in a folder
npm run ingest:folder -- --folder ./documents

# Or use npx directly
npx tsx src/scripts/ingest-folder.ts --folder ./documents
```

### Advanced Options

```bash
# Process with custom batch size and recursive scanning
npm run ingest:folder -- --folder ./docs --batch-size 3 --recursive

# Dry run to see what would be processed
npm run ingest:folder -- --folder ./pdfs --dry-run

# Show help
npm run ingest:folder -- --help
```

## Command Line Options

| Option         | Short | Description                                          | Default |
| -------------- | ----- | ---------------------------------------------------- | ------- |
| `--folder`     | `-f`  | Path to folder containing PDF documents (required)   | -       |
| `--batch-size` | `-b`  | Number of files to process concurrently              | 5       |
| `--recursive`  | `-r`  | Process subdirectories recursively                   | false   |
| `--dry-run`    | `-d`  | Show what files would be processed without ingesting | false   |
| `--help`       | `-h`  | Show help message                                    | false   |

## Examples

### Process Documents Folder

```bash
npm run ingest:folder -- --folder ./documents
```

### Process with Smaller Batches (Recommended for Large Files)

```bash
npm run ingest:folder -- --folder ./large-pdfs --batch-size 2
```

### Recursive Processing with Custom Batch Size

```bash
npm run ingest:folder -- --folder ./research-papers --batch-size 3 --recursive
```

### Dry Run to Preview Files

```bash
npm run ingest:folder -- --folder ./documents --dry-run
```

## Sample Output

```
🔍 Scanning for PDF files in: /path/to/documents
   Recursive: No
   Batch size: 5
   Dry run: No

📁 Found 8 PDF files:
   1. documents/report1.pdf
   2. documents/report2.pdf
   3. documents/manual.pdf
   ...

🚀 Starting batch processing (2 batches)...

📦 Processing batch 1/2 (5 files)...
✅ Processed report1.pdf: 12 documents (1234ms)
✅ Processed report2.pdf: 8 documents (987ms)
...
📊 Batch 1 results: 5 success, 0 failed, 45 total documents

📦 Processing batch 2/2 (3 files)...
...

📊 Processing Summary:
   Total files: 8
   Successful: 8
   Failed: 0
   Documents extracted: 73

🔄 Ingesting 73 documents into vector database...
✅ Successfully ingested 73 documents (5678ms)

🎉 Batch ingestion completed successfully!
```

## Directory Structure

Place your PDF documents in any folder structure, for example:

```
documents/
├── reports/
│   ├── annual-report-2023.pdf
│   └── quarterly-report-q4.pdf
├── manuals/
│   ├── user-guide.pdf
│   └── technical-manual.pdf
└── research/
    ├── paper1.pdf
    └── paper2.pdf
```

## Performance Tips

1. **Batch Size**: Adjust `--batch-size` based on your system resources and file sizes
   - Large files: Use smaller batch sizes (2-3)
   - Small files: Use larger batch sizes (5-10)
   - Default: 5 files per batch

2. **Memory Usage**: The script processes files in memory, so monitor system resources with large files

3. **Network**: If using a remote vector database, consider network latency when setting batch sizes

## Error Handling

- **Individual File Failures**: The script continues processing other files even if some fail
- **Network Issues**: Retries are handled by the underlying vector database client
- **Invalid PDFs**: Corrupted or invalid PDF files are logged but don't stop the entire process
- **Permission Errors**: Files that can't be read are skipped with warnings

## Environment Setup

Ensure your environment variables are configured for the vector database:

```bash
# PostgreSQL (recommended)
RETRIEVER_PROVIDER=postgresql
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Or other supported providers
RETRIEVER_PROVIDER=supabase
# ... other provider configs
```

## Integration with Frontend

Documents ingested via this script will appear in the same vector database as documents uploaded through the frontend, so they can be queried through the chat interface immediately after ingestion.

## Troubleshooting

### "No PDF files found"

- Check the folder path is correct
- Ensure files have `.pdf` extension (case-insensitive)
- Use `--recursive` if files are in subdirectories

### "Failed to ingest documents"

- Check database connection and credentials
- Verify the vector database is running
- Check available disk space and memory

### Individual file processing failures

- Check if PDF files are corrupted
- Verify file permissions
- Monitor memory usage for very large files
