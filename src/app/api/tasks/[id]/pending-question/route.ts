import { NextRequest, NextResponse } from 'next/server';
import { agentManager } from '@/lib/agent-manager';

// GET /api/tasks/[id]/pending-question - Get persistent pending question for a task
// This survives CLI auto-handling and attempt completion
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    const data = agentManager.getPersistentQuestion(taskId);
    if (!data) {
      return NextResponse.json({ question: null });
    }

    return NextResponse.json({
      question: {
        attemptId: data.attemptId,
        toolUseId: data.toolUseId,
        questions: data.questions,
      },
    });
  } catch (error) {
    console.error('Error getting persistent question:', error);
    return NextResponse.json(
      { error: 'Failed to get persistent question' },
      { status: 500 }
    );
  }
}
