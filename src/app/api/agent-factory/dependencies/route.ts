import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { dependencyExtractor } from '@agentic-sdk/services/agent-factory/dependency-extractor';
import { claudeDependencyAnalyzer } from '@agentic-sdk/services/agent-factory/claude-dependency-analyzer';
import { installScriptGenerator } from '@agentic-sdk/services/agent-factory/install-script-generator';

interface DependencyTreeNode { type: string; name: string; depth: number; }

// POST /api/agent-factory/dependencies - Analyze dependencies for a discovered component source path
export async function POST(request: NextRequest) {
  try {
    if (!verifyApiKey(request)) return unauthorizedResponse();

    const body = await request.json();
    const { sourcePath, type, useClaude } = body;

    if (!sourcePath || !type) {
      return NextResponse.json({ error: 'Missing sourcePath or type' }, { status: 400 });
    }

    const resolvedPath = require('path').resolve(sourcePath);
    if (!resolvedPath.startsWith(homedir())) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (!existsSync(sourcePath)) {
      return NextResponse.json({ error: 'Source path not found' }, { status: 404 });
    }

    let extracted;
    if (useClaude) {
      const analyzed = await claudeDependencyAnalyzer.analyze(sourcePath, type);
      extracted = { libraries: analyzed.libraries, plugins: analyzed.plugins };
    } else {
      extracted = await dependencyExtractor.extract(sourcePath, type);
    }

    const installScripts = installScriptGenerator.generateAll(extracted.libraries);
    const dependencyTree: DependencyTreeNode[] = (extracted.plugins || []).map(c => ({
      type: c.type, name: c.name, depth: 1,
    }));

    return NextResponse.json({
      libraries: extracted.libraries,
      plugins: extracted.plugins || [],
      installScripts,
      dependencyTree,
      depth: 1,
      hasCycles: false,
      totalPlugins: (extracted.plugins || []).length,
      resolvedAt: Date.now(),
      analysisMethod: useClaude ? 'claude-sdk' : 'regex',
    });
  } catch (error) {
    console.error('Error extracting dependencies:', error);
    return NextResponse.json({ error: 'Failed to extract dependencies' }, { status: 500 });
  }
}
