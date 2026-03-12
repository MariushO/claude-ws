import { NextResponse } from 'next/server';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { db } from '@/lib/db';
import { checkpointManager } from '@/lib/checkpoint-manager';
import { sessionManager } from '@/lib/session-manager';
import { createCheckpointOperationsService, CheckpointNotFoundError } from '@agentic-sdk/services/checkpoints/fork-and-rewind-operations';
import { createLogger } from '@/lib/logger';

const log = createLogger('CheckpointForkAPI');
const checkpointOpsService = createCheckpointOperationsService(db);

process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING = '1';

// POST /api/checkpoints/fork
export async function POST(request: Request) {
  try {
    const { checkpointId } = await request.json();
    if (!checkpointId) {
      return NextResponse.json({ error: 'checkpointId required' }, { status: 400 });
    }

    const result = await checkpointOpsService.forkWithSideEffects(checkpointId, {
      attemptSdkFileRewind: (checkpoint, project) => attemptSdkFileRewind(checkpoint, project),
      setRewindState: (taskId, sessionId, messageUuid) => sessionManager.setRewindState(taskId, sessionId, messageUuid),
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CheckpointNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    log.error({ err: error }, 'Failed to fork from checkpoint');
    return NextResponse.json({ error: 'Failed to fork from checkpoint' }, { status: 500 });
  }
}

/**
 * Attempt to rewind files using SDK checkpointing.
 * This is a runtime operation using checkpointManager singleton — stays in Next.js route.
 */
async function attemptSdkFileRewind(
  checkpoint: { sessionId: string; gitCommitHash: string | null },
  project: { path: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    log.info({ projectPath: project.path, sessionId: checkpoint.sessionId, messageUuid: checkpoint.gitCommitHash }, 'Attempting SDK file rewind for fork');

    const checkpointOptions = checkpointManager.getCheckpointingOptions();
    const rewindQuery = query({
      prompt: '',
      options: {
        cwd: project.path,
        resume: checkpoint.sessionId,
        ...checkpointOptions,
      },
    });
    await rewindQuery.supportedCommands();

    const rewindResult = await rewindQuery.rewindFiles(checkpoint.gitCommitHash!);
    if (!rewindResult.canRewind) {
      const baseError = rewindResult.error || 'Cannot rewind files';
      throw new Error(
        baseError.includes('No file checkpoint')
          ? `${baseError}. SDK only tracks files within project directory (${project.path}).`
          : baseError
      );
    }

    log.info({ filesChanged: rewindResult.filesChanged?.length || 0 }, 'SDK file rewind for fork successful');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ err: error }, 'SDK rewind for fork failed');
    return { success: false, error: errorMessage };
  }
}
