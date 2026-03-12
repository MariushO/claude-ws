import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createShellService, toShellInfo } from '@agentic-sdk/services/shell/shell-process-db-tracking';

const shellService = createShellService(db);

// GET /api/shells?projectId=xxx - List shells for a project
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    const shells = await shellService.list(projectId);
    return NextResponse.json(shells.map(toShellInfo));
  } catch (error) {
    console.error('Failed to fetch shells:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shells' },
      { status: 500 }
    );
  }
}
