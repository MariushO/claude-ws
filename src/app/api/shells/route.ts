import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createShellService } from '@agentic-sdk/services/shell-process-db-tracking';

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

    // Map to frontend format
    const shellInfos = shells.map((s: any) => ({
      shellId: s.id,
      projectId: s.projectId,
      attemptId: s.attemptId || '',
      command: s.command,
      pid: s.pid || 0,
      startedAt: s.createdAt,
      isRunning: s.status === 'running',
      exitCode: s.exitCode,
    }));

    return NextResponse.json(shellInfos);
  } catch (error) {
    console.error('Failed to fetch shells:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shells' },
      { status: 500 }
    );
  }
}
