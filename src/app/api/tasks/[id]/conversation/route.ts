import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createTaskService } from '@agentic-sdk/services/task/task-crud-and-reorder';

const taskService = createTaskService(db);

// GET /api/tasks/[id]/conversation - Build conversation turns from all attempts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const turns = await taskService.getConversationHistory(taskId);
    return NextResponse.json({ turns });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversation' },
      { status: 500 }
    );
  }
}
