import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createAttemptService } from '@agentic-sdk/services/attempts/crud-and-logs';

const attemptService = createAttemptService(db);

// GET /api/attempts/[id]/status - Get attempt status only (lightweight)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await attemptService.getStatus(id);

    if (!result) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }

    return NextResponse.json({ status: result.status });
  } catch (error) {
    console.error('Failed to fetch attempt status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch attempt status' },
      { status: 500 }
    );
  }
}
