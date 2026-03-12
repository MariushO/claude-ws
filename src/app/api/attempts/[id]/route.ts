import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { formatOutput } from '@/lib/output-formatter';
import { getContentTypeForFormat } from '@/lib/content-types';
import { createAttemptService } from '@agentic-sdk/services/attempt/attempt-crud-and-logs';
import type { ClaudeOutput, OutputFormat } from '@/types';

const attemptService = createAttemptService(db);

// GET /api/attempts/[id] - Get attempt with logs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    // Fetch the attempt with logs
    const result = await attemptService.getById(id);

    if (!result) {
      return NextResponse.json(
        { error: 'Attempt not found' },
        { status: 404 }
      );
    }

    const { logs, ...attemptData } = result;

    // Check if ?output_format query param is present
    const wantsFormatted = searchParams.has('output_format');
    const storedFormat = attemptData.outputFormat;

    // If ?output_format is present and attempt has a format, return the generated file
    if (wantsFormatted && storedFormat) {
      const fileResult = await attemptService.readOutputFile(id, storedFormat);
      if (fileResult.found) {
        return new NextResponse(fileResult.content, {
          headers: { 'Content-Type': getContentTypeForFormat(storedFormat) },
        });
      }
      return NextResponse.json(
        { error: 'Output file not found' },
        { status: 404 }
      );
    }

    // Default: return original JSON structure with logs
    if (!storedFormat || storedFormat === 'json') {
      return NextResponse.json({
        ...attemptData,
        logs,
      });
    }

    // Format according to the stored outputFormat
    const messages = attemptService.parseLogsToMessages(logs) as ClaudeOutput[];

    const formatted = formatOutput(
      messages,
      storedFormat as OutputFormat,
      attemptData.outputSchema,
      {
        id: attemptData.id,
        taskId: attemptData.taskId,
        prompt: attemptData.prompt,
        status: attemptData.status,
        createdAt: attemptData.createdAt,
        completedAt: attemptData.completedAt
      }
    );

    return NextResponse.json(formatted);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch attempt' },
      { status: 500 }
    );
  }
}

// POST /api/attempts/[id] - Reactivate a completed/failed attempt
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get the attempt
    const result = await attemptService.getById(id);

    if (!result) {
      return NextResponse.json(
        { error: 'Attempt not found' },
        { status: 404 }
      );
    }

    const { logs: _logs, ...attemptData } = result;

    // Only reactivate attempts that are not already running
    if (attemptData.status === 'running') {
      return NextResponse.json({
        success: true,
        alreadyRunning: true,
        attempt: { id: attemptData.id, status: attemptData.status }
      });
    }

    // Reactivate the attempt
    await attemptService.updateStatus(id, 'running', { completedAt: null as any });

    console.log(`[reactivate] Reactivated attempt ${id} for task ${attemptData.taskId}`);

    return NextResponse.json({
      success: true,
      attempt: { id: attemptData.id, status: 'running' }
    });
  } catch (error) {
    console.error('Error reactivating attempt:', error);
    return NextResponse.json(
      { error: 'Failed to reactivate attempt' },
      { status: 500 }
    );
  }
}
