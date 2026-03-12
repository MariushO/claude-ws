/**
 * Upload archive orchestration — validates, extracts, and analyzes uploaded archives.
 * Moves business logic out of Next.js route into SDK service layer.
 */
import { mkdir, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { extractArchive } from './archive-extraction';
import { analyzeForPreview, analyzeAndOrganize, importFromSession } from './upload-analysis-and-import';
import type { UploadSession } from './upload-analysis-and-import';

export type { UploadSession };

const VALID_EXTENSIONS = ['.zip', '.tar', '.gz', '.gzip', '.tgz'];
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB

export interface UploadSessionStore {
  get(id: string): UploadSession | undefined;
  set(id: string, session: UploadSession): void;
  delete(id: string): void;
}

export interface RegistryAdapter {
  upsertPlugin(name: string, type: string, data: Record<string, unknown>): Promise<unknown>;
}

export interface UploadResult {
  success: boolean;
  message?: string;
  error?: string;
  sessionId?: string;
  items?: any[];
  globalImport?: boolean;
}

/** Validate uploaded file name and buffer size */
export function validateArchiveUpload(fileName: string, bufferSize: number): string | null {
  const lowerName = fileName.toLowerCase();
  if (!VALID_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
    return 'Invalid file type. Only .zip, .tar, .gz, .gzip, or .tgz files are allowed.';
  }
  if (bufferSize > MAX_UPLOAD_SIZE) {
    return 'File too large. Maximum size is 50MB.';
  }
  return null;
}

/** Ensure agent-factory component directories exist */
export async function ensureComponentDirs(baseDir: string): Promise<void> {
  await mkdir(join(baseDir, 'skills'), { recursive: true });
  await mkdir(join(baseDir, 'commands'), { recursive: true });
  await mkdir(join(baseDir, 'agents'), { recursive: true });
}

/** Handle multipart archive upload: validate, extract, analyze */
export async function handleArchiveUpload(
  buffer: Buffer,
  fileName: string,
  dryRun: boolean,
  agentFactoryDir: string,
  sessionStore: UploadSessionStore
): Promise<UploadResult> {
  const validationError = validateArchiveUpload(fileName, buffer.length);
  if (validationError) return { success: false, error: validationError };

  await ensureComponentDirs(agentFactoryDir);

  const tempDir = join(process.env.TMPDIR || '/tmp', 'agent-factory-upload');
  if (!existsSync(tempDir)) await mkdir(tempDir, { recursive: true });

  const tempFilePath = join(tempDir, `${Date.now()}-${fileName}`);
  const extractDir = join(tempDir, `extract-${Date.now()}`);

  await writeFile(tempFilePath, buffer);
  await mkdir(extractDir, { recursive: true });
  await extractArchive(tempFilePath, extractDir, fileName);
  await unlink(tempFilePath);

  if (dryRun) {
    const previewItems = await analyzeForPreview(extractDir, agentFactoryDir);
    const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    sessionStore.set(sessionId, { extractDir, items: previewItems, createdAt: Date.now() });
    return { success: true, sessionId, items: previewItems };
  }

  const items = await analyzeAndOrganize(extractDir, agentFactoryDir);
  return {
    success: true,
    message: `File uploaded successfully. Organized ${items.length} component(s).`,
    items,
  };
}

/** Confirm a previewed upload session: import components and cleanup */
export async function confirmArchiveUpload(
  sessionId: string,
  globalImport: boolean,
  agentFactoryDir: string,
  globalClaudeDir: string,
  sessionStore: UploadSessionStore,
  registryAdapter: RegistryAdapter,
  cleanupDir: (dir: string) => Promise<void>
): Promise<UploadResult> {
  const session = sessionStore.get(sessionId);
  if (!session) return { success: false, error: 'Session expired or not found. Please upload again.' };

  const targetDir = globalImport ? globalClaudeDir : agentFactoryDir;
  await ensureComponentDirs(targetDir);

  const items = await importFromSession(session, targetDir, globalImport, registryAdapter, cleanupDir);

  await cleanupDir(session.extractDir);
  sessionStore.delete(sessionId);

  const locationMsg = globalImport ? ' globally to ~/.claude' : '';
  return {
    success: true,
    message: `File uploaded successfully${locationMsg}. Organized ${items.length} component(s).`,
    items,
    globalImport,
  };
}
