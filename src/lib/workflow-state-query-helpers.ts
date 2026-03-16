/**
 * Workflow State Query Helpers - Read-only accessors for WorkflowState tree and summary data
 *
 * Extracted from workflow-tracker.ts. Pure functions that derive summary, tree,
 * and expanded workflow data from a WorkflowState without mutating it.
 */

import type { WorkflowState, SubagentNode, AgentMessage, TrackedTask, WorkflowSummary } from './workflow-tracker-types';

/**
 * Build a WorkflowSummary from a WorkflowState (chain of root agent names + counts).
 */
export function buildWorkflowSummary(workflow: WorkflowState): WorkflowSummary {
  const chain: string[] = [];
  for (const rootId of workflow.rootNodes) {
    const node = workflow.nodes.get(rootId);
    if (node) chain.push(node.name || node.type);
  }
  return {
    chain,
    completedCount: workflow.completedNodes.length,
    activeCount: workflow.activeNodes.length,
    totalCount: workflow.nodes.size,
  };
}

/**
 * Return all nodes sorted by depth then startedAt (for tree display).
 */
export function buildWorkflowTree(workflow: WorkflowState): SubagentNode[] {
  return Array.from(workflow.nodes.values()).sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return (a.startedAt || 0) - (b.startedAt || 0);
  });
}

/**
 * Build the expanded workflow payload for socket emission.
 */
export function buildExpandedWorkflow(workflow: WorkflowState): {
  nodes: SubagentNode[];
  messages: AgentMessage[];
  tasks: TrackedTask[];
  mode: 'subagent' | 'agent-team';
  summary: WorkflowSummary;
} {
  return {
    nodes: buildWorkflowTree(workflow),
    messages: workflow.messages,
    tasks: workflow.tasks,
    mode: workflow.mode,
    summary: buildWorkflowSummary(workflow),
  };
}
