import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createProjectService, ProjectValidationError } from '@agentic-sdk/services/project/project-crud';

const projectService = createProjectService(db);

// GET /api/projects/[id]
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await projectService.getById(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json(project);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

// PUT /api/projects/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { name, path } = await request.json();
    const project = await projectService.updateProject(id, { name, path });
    return NextResponse.json(project);
  } catch (error: any) {
    if (error instanceof ProjectValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

// DELETE /api/projects/[id]
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await projectService.deleteProject(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof ProjectValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
