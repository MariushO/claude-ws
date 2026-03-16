'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TrackedTask } from '@/lib/workflow-tracker';
import type { WorkflowEntry } from '@/stores/workflow-store';

function StatusIcon({ status }: { status: TrackedTask['status'] }) {
  switch (status) {
    case 'completed':
      return <span className="text-green-500 text-xs">&#10003;</span>;
    case 'in_progress':
      return <span className="text-blue-500 text-xs animate-pulse">&#9679;</span>;
    case 'deleted':
      return <span className="text-red-500 text-xs">&#10007;</span>;
    default:
      return <span className="text-muted-foreground text-xs">&#9675;</span>;
  }
}

function StatusBadge({ status }: { status: TrackedTask['status'] }) {
  const styles: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    in_progress: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    completed: 'bg-green-500/10 text-green-600 border-green-500/20',
    deleted: 'bg-red-500/10 text-red-500 border-red-500/20',
  };

  return (
    <Badge variant="outline" className={cn('text-[9px] px-1 py-0', styles[status])}>
      {status}
    </Badge>
  );
}

interface TaskListTabProps {
  workflows: Map<string, WorkflowEntry>;
}

export function TaskListTab({ workflows }: TaskListTabProps) {
  // Merge all tasks from all workflows
  const allTasks: TrackedTask[] = [];
  for (const entry of workflows.values()) {
    allTasks.push(...entry.tasks);
  }

  if (allTasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">No tracked tasks</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-1">
        {allTasks.map((task, idx) => (
          <div
            key={task.id || idx}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded text-xs',
              task.status === 'deleted' && 'opacity-50',
            )}
          >
            <StatusIcon status={task.status} />
            <span
              className={cn(
                'flex-1 truncate',
                task.status === 'deleted' && 'line-through',
              )}
            >
              {task.subject}
            </span>
            {task.owner && (
              <span className="text-muted-foreground/60 text-[10px] shrink-0">
                {task.owner}
              </span>
            )}
            <StatusBadge status={task.status} />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
