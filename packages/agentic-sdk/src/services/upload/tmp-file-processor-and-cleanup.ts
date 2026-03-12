/**
 * Process temp uploads into attempt-specific storage and cleanup orphaned tmp files.
 * Called when an attempt is created with tempIds from the tmp upload flow.
 */
import { mkdir, rename, readdir, stat, unlink } from 'fs/promises';
import { join, extname } from 'path';
import * as schema from '../../db/database-schema.ts';
import { generateId } from '../../lib/nanoid-id-generator.ts';
import { getContentTypeForExtension } from '../../lib/content-type-map.ts';

export interface ProcessedFile {
  id: string;
  filename: string;
  originalName: string;
  absolutePath: string;
  mimeType: string;
  size: number;
}

/**
 * Move temp files from uploads/tmp/ to uploads/{attemptId}/ and insert DB records.
 * Returns metadata for each successfully processed file.
 */
export async function processAttachments(
  db: any,
  uploadsDir: string,
  attemptId: string,
  tempIds: string[]
): Promise<ProcessedFile[]> {
  if (tempIds.length === 0) return [];

  const tmpDir = join(uploadsDir, 'tmp');
  const attemptDir = join(uploadsDir, attemptId);
  await mkdir(attemptDir, { recursive: true });

  const results: ProcessedFile[] = [];

  for (const tempId of tempIds) {
    try {
      const tempFiles = await readdir(tmpDir);
      const tempFile = tempFiles.find((f) => f.startsWith(tempId));
      if (!tempFile) continue;

      const tempPath = join(tmpDir, tempFile);
      const fileId = generateId('file');
      const ext = extname(tempFile);
      const newFilename = `${fileId}${ext}`;
      const newPath = join(attemptDir, newFilename);

      // Move file from temp to attempt directory
      await rename(tempPath, newPath);

      const stats = await stat(newPath);
      const mimeType = getContentTypeForExtension(ext);

      // Extract original name: pattern is {tempId}-{timestamp}.{ext}
      const extClean = ext.startsWith('.') ? ext.slice(1) : ext;
      const originalName = extClean ? `attachment.${extClean}` : 'attachment';

      await db.insert(schema.attemptFiles).values({
        id: fileId,
        attemptId,
        filename: newFilename,
        originalName,
        mimeType,
        size: stats.size,
      });

      results.push({ id: fileId, filename: newFilename, originalName, absolutePath: newPath, mimeType, size: stats.size });
    } catch {
      // Skip individual file failures
    }
  }

  return results;
}

/**
 * Delete orphaned temp files older than 1 hour from uploads/tmp/.
 * Returns the number of files cleaned up.
 */
export async function cleanupOrphanedTempFiles(uploadsDir: string): Promise<number> {
  const tmpDir = join(uploadsDir, 'tmp');
  try {
    const tempFiles = await readdir(tmpDir);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    let cleaned = 0;

    for (const file of tempFiles) {
      try {
        const filePath = join(tmpDir, file);
        const stats = await stat(filePath);
        if (stats.mtimeMs < oneHourAgo) {
          await unlink(filePath);
          cleaned++;
        }
      } catch {
        // Skip individual file cleanup failures
      }
    }

    return cleaned;
  } catch {
    return 0;
  }
}
