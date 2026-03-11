import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { createProjectService } from '@agentic-sdk/services/project-crud';

const log = createLogger('ProjectById');
const projectService = createProjectService(db);

// GET /api/projects/[id] - Get a single project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await projectService.getById(id);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    log.error({ error }, 'Failed to fetch project');
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id] - Update a project
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, path } = body;

    if (!name && !path) {
      return NextResponse.json(
        { error: 'At least one field (name or path) is required' },
        { status: 400 }
      );
    }

    const updateData: Partial<{ name: string; path: string }> = {};
    if (name) updateData.name = name;
    if (path) updateData.path = path;

    const updatedProject = await projectService.update(id, updateData);

    if (!updatedProject) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedProject);
  } catch (error: any) {
    log.error({ error }, 'Failed to update project');

    // Handle unique constraint violation (duplicate path)
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json(
        { error: 'A project with this path already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] - Delete a project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check existence first since service.remove() doesn't return change count
    const existing = await projectService.getById(id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    await projectService.remove(id);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    log.error({ error }, 'Failed to delete project');
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}
