import { NextRequest, NextResponse } from 'next/server';
import { createFileTreeAndContentService } from '@agentic-sdk/services/files/tree-and-content';

const fileContentService = createFileTreeAndContentService();

// GET /api/files/content?path=xxx&basePath=xxx
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('path');
    const basePath = searchParams.get('basePath');

    if (!filePath || !basePath) {
      return NextResponse.json(
        { error: 'path and basePath parameters are required' },
        { status: 400 }
      );
    }

    const result = fileContentService.getFileContentSync(basePath, filePath);
    return NextResponse.json(result);
  } catch (error: any) {
    const msg = error?.message || '';
    if (msg === 'Access denied: base path outside home directory') {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg === 'Invalid path: directory traversal detected') {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg === 'File not found') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    if (msg === 'Path is not a file') {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg === 'File too large') {
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    }
    console.error('Error reading file:', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}

// POST /api/files/content - Save file content
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { basePath, path: filePath, content } = body;

    if (!filePath || !basePath || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'basePath, path, and content are required' },
        { status: 400 }
      );
    }

    const result = fileContentService.saveFileContentSync(basePath, filePath, content);
    return NextResponse.json(result);
  } catch (error: any) {
    const msg = error?.message || '';
    if (msg === 'Access denied: base path outside home directory') {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg === 'Invalid path: directory traversal detected') {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg === 'File not found') {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === 'Path is not a file') {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg === 'Cannot write to binary files') {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error('Error writing file:', error);
    return NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
  }
}
