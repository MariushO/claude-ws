'use client';

import { MessageCircleQuestion, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuestionsStore, type PendingQuestionEntry } from '@/stores/questions-store';
import { useTaskStore } from '@/stores/task-store';
import { cn } from '@/lib/utils';

interface Question {
  question: string;
  header: string;
  options: Array<{ label: string; description: string }>;
  multiSelect: boolean;
}

function QuestionEntryItem({ entry }: { entry: PendingQuestionEntry }) {
  const { selectTask } = useTaskStore();
  const { closePanel } = useQuestionsStore();

  const questions = entry.questions as Question[];
  const firstQuestion = questions[0];

  const handleGoToTask = () => {
    selectTask(entry.taskId);
    closePanel();
  };

  const timeAgo = formatTimeAgo(entry.timestamp);

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Clickable summary row - opens task in chat */}
      <button
        onClick={handleGoToTask}
        className="w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors flex items-start gap-2"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium truncate">{entry.taskTitle}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              {firstQuestion?.header}
            </Badge>
            <span className="text-xs text-muted-foreground truncate">
              {firstQuestion?.question}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMs / 3600000);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffMs / 86400000)}d ago`;
}

interface QuestionsPanelProps {
  className?: string;
}

export function QuestionsPanel({ className }: QuestionsPanelProps) {
  const { isOpen, closePanel, pendingQuestions } = useQuestionsStore();
  const entries = Array.from(pendingQuestions.values()).sort((a, b) => b.timestamp - a.timestamp);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay for mobile */}
      <div
        className="fixed inset-0 bg-black/50 z-40 sm:hidden"
        onClick={closePanel}
      />

      {/* Sidebar */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-96 bg-background border-l shadow-lg z-50',
          'flex flex-col',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <MessageCircleQuestion className="size-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Pending Questions</h2>
            {entries.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {entries.length}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={closePanel}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <MessageCircleQuestion className="size-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No pending questions</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Questions from running tasks will appear here
              </p>
            </div>
          ) : (
            entries.map((entry) => (
              <QuestionEntryItem
                key={entry.attemptId}
                entry={entry}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
