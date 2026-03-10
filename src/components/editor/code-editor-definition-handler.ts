'use client';

/**
 * Hook for go-to-definition and symbol lookup logic.
 *
 * Handles fetching definition info from the language server API
 * and navigating to symbol definitions via the sidebar store.
 */

import { useState, useCallback } from 'react';
import type { ExtractedSymbol, DefinitionInfo } from './extensions/goto-definition';
import { useSidebarStore } from '@/stores/sidebar-store';

interface UseDefinitionHandlerOptions {
  filePath?: string;
  basePath?: string;
  language?: string | null;
  fileContent: string;
}

interface DefinitionPopupState {
  definition: DefinitionInfo | null;
  position: { x: number; y: number } | null;
}

export function useDefinitionHandler({
  filePath,
  basePath,
  language,
  fileContent,
}: UseDefinitionHandlerOptions) {
  const { openTab, setEditorPosition, setSelectedFile, expandFolder } = useSidebarStore();

  const [definitionPopup, setDefinitionPopup] = useState<DefinitionPopupState>({
    definition: null,
    position: null,
  });

  const handleDefinitionRequest = useCallback(
    async (symbol: ExtractedSymbol): Promise<DefinitionInfo | null> => {
      if (!filePath || !basePath) {
        return null;
      }

      try {
        const response = await fetch('/api/language/definition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            basePath,
            filePath,
            symbol: symbol.text,
            line: symbol.line,
            column: symbol.column,
            language,
            fileContent,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          return { found: false, error: error.error || 'Failed to resolve definition' };
        }

        return await response.json();
      } catch (error) {
        return {
          found: false,
          error: error instanceof Error ? error.message : 'Network error',
        };
      }
    },
    [filePath, basePath, language, fileContent]
  );

  const handleNavigate = useCallback(
    (definition: DefinitionInfo) => {
      if (!definition.found || !definition.definition) return;

      const { filePath: defPath, line, column, symbol } = definition.definition;

      const parts = defPath.split('/');
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath += (i > 0 ? '/' : '') + parts[i];
        expandFolder(currentPath);
      }

      openTab(defPath);
      setSelectedFile(defPath);
      setEditorPosition({
        lineNumber: line,
        column: column,
        matchLength: symbol.length,
      });
    },
    [openTab, setSelectedFile, setEditorPosition, expandFolder]
  );

  const handleShowPreview = useCallback(
    (definition: DefinitionInfo, position: { x: number; y: number }) => {
      setDefinitionPopup({ definition, position });
    },
    []
  );

  const handleHidePreview = useCallback(() => {
    setDefinitionPopup({ definition: null, position: null });
  }, []);

  return {
    definitionPopup,
    handleDefinitionRequest,
    handleNavigate,
    handleShowPreview,
    handleHidePreview,
  };
}
