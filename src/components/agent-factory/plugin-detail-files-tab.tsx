'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { PluginDetailFileContentModal, type FileContent } from './plugin-detail-file-content-modal';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

interface PluginIdentifier {
  id?: string;
  sourcePath?: string | null;
  type: string;
  isImported: boolean;
  canEdit: boolean;
}

interface PluginDetailFilesTabProps {
  plugin: PluginIdentifier;
  error: string | null;
  setError: (error: string | null) => void;
}

export function PluginDetailFilesTab({
  plugin,
  error,
  setError,
}: PluginDetailFilesTabProps) {
  const t = useTranslations('agentFactory');

  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [fileModalOpen, setFileModalOpen] = useState(false);

  // Fetch files on mount (component is remounted via key when plugin changes)
  useEffect(() => {
    fetchFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchFiles = async () => {
    setLoadingFiles(true);
    setError(null);
    try {
      let fileData;
      if (plugin.isImported) {
        const res = await fetch(`/api/agent-factory/plugins/${plugin.id}/files`);
        if (!res.ok) throw new Error(t('failedToLoadFiles'));
        fileData = await res.json();
      } else {
        const res = await fetch('/api/agent-factory/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourcePath: plugin.sourcePath, type: plugin.type }),
        });
        if (!res.ok) throw new Error(t('failedToLoadFiles'));
        fileData = await res.json();
      }
      setFiles(fileData.files || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToLoadFiles'));
    } finally {
      setLoadingFiles(false);
    }
  };

  const fetchFileContent = async (filePath: string) => {
    setLoadingContent(true);
    setError(null);
    try {
      let data;
      if (plugin.isImported) {
        const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
        const res = await fetch(`/api/agent-factory/plugins/${plugin.id}/files/${encodedPath}`);
        if (!res.ok) throw new Error(t('failedToLoadFile'));
        data = await res.json();
      } else {
        const res = await fetch('/api/agent-factory/file-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ basePath: plugin.sourcePath, filePath }),
        });
        if (!res.ok) throw new Error(t('failedToLoadFile'));
        data = await res.json();
      }
      setFileContent(data);
      setFileModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToLoadFile'));
    } finally {
      setLoadingContent(false);
    }
  };

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const handleFileClick = (node: FileNode) => {
    if (node.type === 'directory') {
      toggleDir(node.path);
    } else {
      setSelectedFile(node.path);
      fetchFileContent(node.path);
    }
  };

  const renderFileTree = (nodes: FileNode[], level = 0): React.ReactNode => {
    return nodes.map((node) => (
      <div key={node.path}>
        <div
          className={`flex items-center gap-1 py-1 px-2 hover:bg-muted rounded cursor-pointer text-sm ${
            selectedFile === node.path ? 'bg-muted' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => handleFileClick(node)}
        >
          {node.type === 'directory' ? (
            <>
              {expandedDirs.has(node.path) ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <Folder className="w-4 h-4 text-blue-500" />
            </>
          ) : (
            <>
              <span className="w-4 h-3" />
              <File className="w-4 h-4 text-gray-500" />
            </>
          )}
          <span className="truncate">{node.name}</span>
        </div>
        {node.type === 'directory' &&
          expandedDirs.has(node.path) &&
          node.children &&
          renderFileTree(node.children, level + 1)}
      </div>
    ));
  };

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <div className="p-2 border-b bg-muted/50 text-sm font-medium">
          {t('files')}
        </div>
        <div className="p-2 max-h-[400px] overflow-y-auto">
          {loadingFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-sm text-destructive py-4">{error}</div>
          ) : files.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">{t('noFilesFound')}</div>
          ) : (
            renderFileTree(files)
          )}
        </div>
      </div>

      <PluginDetailFileContentModal
        open={fileModalOpen}
        onOpenChange={setFileModalOpen}
        fileContent={fileContent}
        loadingContent={loadingContent}
        canEdit={plugin.canEdit}
        pluginId={plugin.id}
        error={error}
        setError={setError}
        onContentSaved={setFileContent}
      />
    </>
  );
}
