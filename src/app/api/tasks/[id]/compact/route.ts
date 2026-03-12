import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agentManager } from '@/lib/agent-manager';
import { createLogger } from '@/lib/logger';
import { createTaskService } from '@agentic-sdk/services/task/task-crud-and-reorder';
import { createProjectService } from '@agentic-sdk/services/project/project-crud';
import { createAttemptService } from '@agentic-sdk/services/attempt/attempt-crud-and-logs';

const log = createLogger('CompactTask');
const taskService = createTaskService(db);
const projectService = createProjectService(db);
const attemptService = createAttemptService(db);

// POST /api/tasks/[id]/compact - Trigger conversation compaction
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    const task = await taskService.getById(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const project = await projectService.getById(task.projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Use SDK service method — single source of truth for conversation summary logic
    const conversationSummary = await taskService.getConversationSummaryForCompact(taskId);

    const attempt = await attemptService.create({
      taskId,
      prompt: 'Compact: summarize conversation context',
      displayPrompt: 'Compacting conversation...',
    });

    log.info({ attemptId: attempt.id, taskId }, 'Starting compact');

    agentManager.compact({
      attemptId: attempt.id,
      projectPath: project.path,
      conversationSummary,
    });

    return NextResponse.json({ success: true, attemptId: attempt.id });
  } catch (error) {
    log.error({ error }, 'Failed to compact');
    return NextResponse.json(
      { error: 'Failed to compact conversation' },
      { status: 500 }
    );
  }
}
