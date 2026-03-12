import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createCheckpointService } from '@agentic-sdk/services/checkpoint/checkpoint-crud-and-rewind';

const checkpointService = createCheckpointService(db);

// GET /api/checkpoints?taskId=xxx
// Returns checkpoints for a task, ordered by createdAt desc
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'taskId required' }, { status: 400 });
    }

    const checkpoints = await checkpointService.listWithAttemptInfo(taskId);
    return NextResponse.json(checkpoints);
  } catch (error) {
    console.error('Failed to fetch checkpoints:', error);
    return NextResponse.json(
      { error: 'Failed to fetch checkpoints' },
      { status: 500 }
    );
  }
}
