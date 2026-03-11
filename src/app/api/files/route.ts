import { NextRequest, NextResponse } from 'next/server';
import { createFileTreeAndContentService } from '@agentic-sdk/services/files/tree-and-content';

const fileTreeService = createFileTreeAndContentService();

// GET /api/files - List directory tree
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const basePath = searchParams.get('path');
    const depth = parseInt(searchParams.get('depth') || '10', 10);
    const showHidden = searchParams.get('showHidden') !== 'false';

    if (!basePath) {
      return NextResponse.json({ error: 'path parameter is required' }, { status: 400 });
    }

    const result = await fileTreeService.listDirectoryTree(basePath, { depth, showHidden });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error: any) {
    if (error?.message === 'Path does not exist') {
      return NextResponse.json({ error: 'Path does not exist' }, { status: 404 });
    }
    if (error?.message === 'Path is not a directory') {
      return NextResponse.json({ error: 'Path is not a directory' }, { status: 400 });
    }
    console.error('Error reading directory:', error);
    return NextResponse.json({ error: 'Failed to read directory' }, { status: 500 });
  }
}
