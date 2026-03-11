import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createTaskService } from '@agentic-sdk/services/task-crud-and-reorder';

const taskService = createTaskService(db);

// GET /api/tasks/[id]/attempts - List attempts for a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    // Verify task exists
    const task = await taskService.getById(taskId);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Fetch attempts for this task
    const attempts = await taskService.getAttempts(taskId);

    return NextResponse.json({ attempts });
  } catch (error) {
    console.error('Error fetching attempts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch attempts' },
      { status: 500 }
    );
  }
}
