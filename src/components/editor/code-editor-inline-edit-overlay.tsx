'use client';

/**
 * Inline edit overlay components for the code editor.
 *
 * Renders the DefinitionPopup, InlineEditDialog, and SelectionMentionPopup
 * overlays, and provides handlers for inline edit actions and context mentions.
 */

import { useCallback, type RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import type { InlineEditSelection } from './extensions/inline-edit';
import type { ContextSelection } from './extensions/add-to-context';
import type { DefinitionInfo } from './extensions/goto-definition';
import { DefinitionPopup } from './definition-popup';
import { InlineEditDialog } from './inline-edit-dialog';
import { SelectionMentionPopup } from './selection-mention-popup';
import type { useInlineEdit } from '@/hooks/use-inline-edit';
import { useContextMentionStore } from '@/stores/context-mention-store';
import { useTaskStore } from '@/stores/task-store';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface CodeEditorInlineEditOverlayProps {
  filePath?: string;
  containerRef: RefObject<HTMLDivElement | null>;
  editorViewRef: RefObject<EditorView | null>;
  inlineEdit: ReturnType<typeof useInlineEdit>;
  definitionPopup: {
    definition: DefinitionInfo | null;
    position: { x: number; y: number } | null;
  };
  onHidePreview: () => void;
}

export function useInlineEditHandlers({
  filePath,
  inlineEdit,
}: {
  filePath?: string;
  inlineEdit: ReturnType<typeof useInlineEdit>;
}) {
  const t = useTranslations('editor');
  const { addLineMention } = useContextMentionStore();
  const { selectedTaskId } = useTaskStore();

  const handleEditRequest = useCallback(
    (selection: InlineEditSelection) => {
      inlineEdit.startEdit(selection);
    },
    [inlineEdit]
  );

  const handleAccept = useCallback(() => {
    inlineEdit.accept();
  }, [inlineEdit]);

  const handleReject = useCallback(() => {
    inlineEdit.reject();
  }, [inlineEdit]);

  const handleAddToContext = useCallback(
    (selection: ContextSelection) => {
      if (!selectedTaskId) {
        toast.error(t('selectTaskFirst'));
        return;
      }

      addLineMention(
        selectedTaskId,
        selection.fileName,
        selection.filePath,
        selection.startLine,
        selection.endLine
      );

      const lineRange =
        selection.startLine === selection.endLine
          ? `L${selection.startLine}`
          : `L${selection.startLine}-${selection.endLine}`;
      toast.success(`Added @${selection.fileName}#${lineRange} to context`);
    },
    [selectedTaskId, addLineMention, t]
  );

  const handleAddSelectionToContext = useCallback(
    (startLine: number, endLine: number) => {
      if (!filePath) return;
      if (!selectedTaskId) {
        toast.error(t('selectTaskFirst'));
        return;
      }

      const fileName = filePath.split('/').pop() || filePath;

      addLineMention(selectedTaskId, fileName, filePath, startLine, endLine);

      const lineRange =
        startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`;
      toast.success(`Added @${fileName}#${lineRange} to context`);
    },
    [filePath, selectedTaskId, addLineMention, t]
  );

  return {
    handleEditRequest,
    handleAccept,
    handleReject,
    handleAddToContext,
    handleAddSelectionToContext,
  };
}

export function CodeEditorInlineEditOverlay({
  filePath,
  containerRef,
  editorViewRef,
  inlineEdit,
  definitionPopup,
  onHidePreview,
}: CodeEditorInlineEditOverlayProps) {
  const { handleAddSelectionToContext } = useInlineEditHandlers({
    filePath,
    inlineEdit,
  });

  return (
    <>
      <DefinitionPopup
        definition={definitionPopup.definition}
        position={definitionPopup.position}
        onClose={onHidePreview}
      />

      {filePath && (
        <InlineEditDialog
          filePath={filePath}
          onSubmit={inlineEdit.submitInstruction}
          onAccept={inlineEdit.accept}
          onReject={inlineEdit.reject}
        />
      )}

      {filePath && (
        <SelectionMentionPopup
          containerRef={containerRef}
          editorViewRef={editorViewRef}
          onAddToContext={handleAddSelectionToContext}
        />
      )}
    </>
  );
}
