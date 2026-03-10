'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Package,
  PackageSearch,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { DependencyTree, type DependencyTreeNode, countPlugins } from './dependency-tree';
import { PluginDetailInstallScriptsPanel, type InstallScripts } from './plugin-detail-install-scripts-panel';

interface LibraryDep {
  name: string;
  version?: string;
  manager: string;
}

export interface DependencyInfo {
  libraries: LibraryDep[];
  plugins: Array<{
    type: 'skill' | 'command' | 'agent';
    name: string;
  }>;
  installScripts?: InstallScripts;
  dependencyTree?: DependencyTreeNode[];
  depth?: number;
  hasCycles?: boolean;
  resolvedAt?: number;
}

interface PluginIdentifier {
  id?: string;
  sourcePath?: string | null;
  type: string;
  isImported: boolean;
}

interface PluginDetailDependenciesTabProps {
  plugin: PluginIdentifier;
  error: string | null;
  setError: (error: string | null) => void;
}

function getTypeColor(type: string) {
  switch (type) {
    case 'skill':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'command':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'agent':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function PluginDetailDependenciesTab({
  plugin,
  error,
  setError,
}: PluginDetailDependenciesTabProps) {
  const t = useTranslations('agentFactory');

  const [dependencies, setDependencies] = useState<DependencyInfo | null>(null);
  const [loadingDeps, setLoadingDeps] = useState(false);
  const [reResolvingDeps, setReResolvingDeps] = useState(false);

  // Fetch dependencies on mount (component is remounted via key when plugin changes)
  useEffect(() => {
    fetchDependencies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDependencies = async () => {
    setLoadingDeps(true);
    setError(null);
    try {
      let data;
      if (plugin.isImported) {
        const res = await fetch(`/api/agent-factory/plugins/${plugin.id}/dependencies`);
        if (!res.ok) throw new Error(t('failedToLoadDependencies'));
        data = await res.json();
      } else {
        const res = await fetch('/api/agent-factory/dependencies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourcePath: plugin.sourcePath, type: plugin.type }),
        });
        if (!res.ok) throw new Error(t('failedToLoadDependencies'));
        data = await res.json();
      }
      setDependencies(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToLoadDependencies'));
    } finally {
      setLoadingDeps(false);
    }
  };

  const reResolveDependencies = async () => {
    setReResolvingDeps(true);
    setError(null);
    try {
      let data;
      if (plugin.isImported) {
        const res = await fetch(`/api/agent-factory/plugins/${plugin.id}/dependencies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ useClaude: true }),
        });
        if (!res.ok) throw new Error(t('failedToReResolveDependencies'));
        data = await res.json();
      } else {
        const res = await fetch('/api/agent-factory/dependencies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourcePath: plugin.sourcePath,
            type: plugin.type,
            useClaude: true,
          }),
        });
        if (!res.ok) throw new Error(t('failedToAnalyzeDependencies'));
        data = await res.json();
      }
      setDependencies(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToReResolveDependencies'));
    } finally {
      setReResolvingDeps(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with re-resolve button */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {dependencies && dependencies.resolvedAt
            ? `Last resolved: ${new Date(dependencies.resolvedAt).toLocaleString()}`
            : t('dependencies')}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={reResolveDependencies}
          disabled={reResolvingDeps}
          className="gap-2"
        >
          {reResolvingDeps ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('reResolving')}
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3" />
              {t('reResolve')}
            </>
          )}
        </Button>
      </div>

      {loadingDeps ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="text-sm text-destructive py-4">{error}</div>
      ) : !dependencies ? (
        <div className="text-sm text-muted-foreground py-4">{t('noDependenciesFound')}</div>
      ) : (
        <>
          {/* Library Dependencies */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <PackageSearch className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">{t('libraryDependencies')}</h3>
              <Badge variant="secondary">{dependencies.libraries.length}</Badge>
            </div>
            {dependencies.libraries.length === 0 ? (
              <p className="text-sm text-muted-foreground pl-6">{t('noExternalLibraries')}</p>
            ) : (
              <div className="pl-6 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {dependencies.libraries.map((lib, idx) => (
                    <Badge key={idx} variant="outline" className="font-mono text-xs">
                      {lib.name}
                      {lib.version && <span className="text-muted-foreground">@{lib.version}</span>}
                      <span className="text-muted-foreground">({lib.manager})</span>
                    </Badge>
                  ))}
                </div>

                {dependencies.installScripts && (
                  <PluginDetailInstallScriptsPanel scripts={dependencies.installScripts} />
                )}
              </div>
            )}
          </div>

          {/* Plugin Dependencies */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">{t('pluginDependencies')}</h3>
              <Badge variant="secondary">
                {dependencies.dependencyTree
                  ? countPlugins(dependencies.dependencyTree)
                  : dependencies.plugins.length}
              </Badge>
            </div>
            {(!dependencies.dependencyTree || dependencies.dependencyTree.length === 0) &&
            dependencies.plugins.length === 0 ? (
              <p className="text-sm text-muted-foreground pl-6">{t('noPluginDependencies')}</p>
            ) : (
              <div className="pl-6">
                {dependencies.dependencyTree ? (
                  <DependencyTree nodes={dependencies.dependencyTree} />
                ) : (
                  <div className="space-y-2">
                    {dependencies.plugins.map((plug, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Badge className={getTypeColor(plug.type)}>{plug.type}</Badge>
                        <span className="text-sm">{plug.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Resolution Info */}
          {(dependencies.depth !== undefined || dependencies.hasCycles) && (
            <div className="text-xs text-muted-foreground pl-6 space-y-1 pt-2 border-t">
              {dependencies.depth !== undefined && (
                <div>
                  Resolution depth:{' '}
                  <span className="font-medium text-foreground">{dependencies.depth}</span>
                </div>
              )}
              {dependencies.hasCycles && (
                <div className="text-orange-500">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  {t('circularDependencies')}
                </div>
              )}
              {dependencies.resolvedAt && (
                <div>Last resolved: {new Date(dependencies.resolvedAt).toLocaleString()}</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
