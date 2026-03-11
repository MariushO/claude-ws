import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { TaskStatus } from '@/types';
import { createLogger } from '@/lib/logger';
import { createTaskService } from '@agentic-sdk/services/task-crud-and-reorder';

const log = createLogger('TaskReorder');
const taskService = createTaskService(db);

interface ReorderItem {
  id: string;
  status: TaskStatus;
  position: number;
}

const validStatuses: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done', 'cancelled'];

// PUT /api/tasks/reorder - Reorder single task
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, status, position } = body as { taskId: string; status: TaskStatus; position: number };

    if (!taskId || !status || position === undefined) {
      return NextResponse.json(
        { error: 'taskId, status, and position are required' },
        { status: 400 }
      );
    }

    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status value: ${status}` },
        { status: 400 }
      );
    }

    // Check existence first
    const existing = await taskService.getById(taskId);
    if (!existing) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    await taskService.reorder(taskId, position, status);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ error }, 'Failed to reorder task');
    return NextResponse.json(
      { error: 'Failed to reorder task' },
      { status: 500 }
    );
  }
}

// POST /api/tasks/reorder - Reorder tasks (batch update)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tasks } = body as { tasks: ReorderItem[] };

    if (!tasks || !Array.isArray(tasks)) {
      return NextResponse.json(
        { error: 'tasks array is required' },
        { status: 400 }
      );
    }

    // Validate all items
    for (const task of tasks) {
      if (!task.id || !task.status || task.position === undefined) {
        return NextResponse.json(
          { error: 'Each task must have id, status, and position' },
          { status: 400 }
        );
      }
      if (!validStatuses.includes(task.status)) {
        return NextResponse.json(
          { error: `Invalid status value: ${task.status}` },
          { status: 400 }
        );
      }
    }

    // Update all tasks sequentially via service
    const errors: string[] = [];

    for (const task of tasks) {
      try {
        await taskService.reorder(task.id, task.position, task.status);
      } catch (error) {
        log.error({ error, taskId: task.id }, 'Failed to update task');
        errors.push(`Failed to update task ${task.id}`);
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: 'Some tasks failed to update',
          details: errors,
        },
        { status: 207 } // Multi-Status
      );
    }

    return NextResponse.json({
      success: true,
      updated: tasks.length,
    });
  } catch (error) {
    log.error({ error }, 'Failed to reorder tasks');
    return NextResponse.json(
      { error: 'Failed to reorder tasks' },
      { status: 500 }
    );
  }
}
