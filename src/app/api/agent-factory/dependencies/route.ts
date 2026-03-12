import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { createAgentFactoryService, AgentFactoryValidationError } from '@agentic-sdk/services/agent-factory/agent-factory-plugin-registry';

const agentFactoryService = createAgentFactoryService(db);

// POST /api/agent-factory/dependencies - Analyze dependencies for a discovered component source path
export async function POST(request: NextRequest) {
  try {
    if (!verifyApiKey(request)) return unauthorizedResponse();

    const { sourcePath, type, useClaude } = await request.json();
    if (!sourcePath || !type) {
      return NextResponse.json({ error: 'Missing sourcePath or type' }, { status: 400 });
    }

    const result = await agentFactoryService.extractDependencies(sourcePath, type, useClaude);
    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof AgentFactoryValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error extracting dependencies:', error);
    return NextResponse.json({ error: 'Failed to extract dependencies' }, { status: 500 });
  }
}
