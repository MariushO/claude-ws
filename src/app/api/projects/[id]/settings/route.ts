import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { createProjectService, ProjectValidationError } from '@agentic-sdk/services/project/project-crud';

const projectService = createProjectService(db);

// GET /api/projects/[id]/settings
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!verifyApiKey(request)) return unauthorizedResponse();
    const { id } = await params;
    const settings = await projectService.getSettingsByProjectId(id);
    return NextResponse.json({ settings });
  } catch (error: any) {
    if (error instanceof ProjectValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to fetch project settings' }, { status: 500 });
  }
}

// POST /api/projects/[id]/settings
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!verifyApiKey(request)) return unauthorizedResponse();
    const { id } = await params;
    const { settings } = await request.json();
    const normalized = await projectService.updateSettingsByProjectId(id, settings);
    return NextResponse.json({ settings: normalized });
  } catch (error: any) {
    if (error instanceof ProjectValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to update project settings' }, { status: 500 });
  }
}
