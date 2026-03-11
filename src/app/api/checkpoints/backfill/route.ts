import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createCheckpointService } from '@agentic-sdk/services/checkpoints/crud-and-rewind';

const checkpointService = createCheckpointService(db);

// POST /api/checkpoints/backfill
// Creates checkpoints for existing completed attempts that don't have one
export async function POST() {
  try {
    const result = await checkpointService.backfillFromCompleted();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Failed to backfill checkpoints:', error);
    return NextResponse.json(
      { error: 'Failed to backfill checkpoints' },
      { status: 500 }
    );
  }
}
