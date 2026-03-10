'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { FileText, Folder, Calendar } from 'lucide-react';
import { Plugin, DiscoveredPlugin } from '@/types/agent-factory';

type PluginDetailProps = Plugin | DiscoveredPlugin;

function isImportedPlugin(plug: PluginDetailProps): plug is Plugin {
  return 'id' in plug && 'storageType' in plug;
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

interface PluginDetailInfoTabProps {
  plugin: PluginDetailProps;
}

export function PluginDetailInfoTab({ plugin }: PluginDetailInfoTabProps) {
  const t = useTranslations('agentFactory');
  const isImported = isImportedPlugin(plugin);

  const formatMetadata = () => {
    if (isImported && plugin.metadata) {
      try {
        return JSON.stringify(JSON.parse(plugin.metadata), null, 2);
      } catch {
        return plugin.metadata;
      }
    } else if (!isImported && plugin.metadata) {
      return JSON.stringify(plugin.metadata, null, 2);
    }
    return null;
  };

  const metadataStr = formatMetadata();

  return (
    <div className="space-y-6">
      {/* Type Badge */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Type:</span>
        <Badge className={getTypeColor(plugin.type)}>
          {plugin.type}
        </Badge>
      </div>

      {/* Description */}
      {plugin.description && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('pluginDescription')}</span>
          </div>
          <p className="text-sm text-muted-foreground pl-6">
            {plugin.description}
          </p>
        </div>
      )}

      {/* Source Path */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Folder className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('sourcePath')}</span>
        </div>
        <code className="text-xs bg-muted px-2 py-1 rounded block pl-6 break-all">
          {plugin.sourcePath}
        </code>
      </div>

      {/* Storage Type - only for imported */}
      {isImported && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('storage')}</span>
          <Badge variant="secondary">{plugin.storageType}</Badge>
        </div>
      )}

      {/* Metadata */}
      {metadataStr && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('metadata')}</span>
          </div>
          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto pl-6">
            {metadataStr}
          </pre>
        </div>
      )}

      {/* Timestamps - only for imported */}
      {isImported && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Created: {new Date(plugin.createdAt).toLocaleString()}
          </div>
          <div className="flex items-center gap-1">
            Updated: {new Date(plugin.updatedAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
