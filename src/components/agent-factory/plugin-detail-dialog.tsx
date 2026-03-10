'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Package } from 'lucide-react';
import { Plugin, DiscoveredPlugin } from '@/types/agent-factory';
import { PluginDetailInfoTab } from './plugin-detail-info-tab';
import { PluginDetailFilesTab } from './plugin-detail-files-tab';
import { PluginDetailDependenciesTab } from './plugin-detail-dependencies-tab';

type PluginDetailProps = Plugin | DiscoveredPlugin;

interface PluginDetailDialogProps {
  plugin: PluginDetailProps;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function isImportedPlugin(plug: PluginDetailProps): plug is Plugin {
  return 'id' in plug && 'storageType' in plug;
}

export function PluginDetailDialog({
  plugin,
  open,
  onOpenChange,
}: PluginDetailDialogProps) {
  const t = useTranslations('agentFactory');
  const tCommon = useTranslations('common');
  const isImported = isImportedPlugin(plugin);
  const [activeTab, setActiveTab] = useState<'details' | 'files' | 'dependencies'>('details');
  const [error, setError] = useState<string | null>(null);

  // Stable key used to remount child tabs when the plugin changes
  const pluginKey = `${plugin.name}-${plugin.sourcePath}`;

  const pluginIdentifier = useMemo(() => ({
    id: isImported ? plugin.id : undefined,
    sourcePath: plugin.sourcePath,
    type: plugin.type,
    isImported,
    canEdit: isImported && plugin.storageType === 'local',
  }), [isImported, plugin]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Package className="w-6 h-6" />
            {plugin.name}
            {!isImported && (
              <Badge variant="outline" className="text-xs">{t('discovered')}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {isImported ? t('pluginDetails') : t('discoveredPluginDetails')}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'details' | 'files' | 'dependencies')}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList>
            <TabsTrigger value="details">{t('details')}</TabsTrigger>
            <TabsTrigger value="files">{t('files')}</TabsTrigger>
            <TabsTrigger value="dependencies">{t('dependencies')}</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="flex-1 overflow-y-auto mt-4">
            <PluginDetailInfoTab plugin={plugin} />
          </TabsContent>

          <TabsContent value="files" className="flex-1 overflow-y-auto mt-4">
            {activeTab === 'files' && (
              <PluginDetailFilesTab
                key={pluginKey}
                plugin={pluginIdentifier}
                error={error}
                setError={setError}
              />
            )}
          </TabsContent>

          <TabsContent value="dependencies" className="flex-1 overflow-y-auto mt-4">
            {activeTab === 'dependencies' && (
              <PluginDetailDependenciesTab
                key={pluginKey}
                plugin={pluginIdentifier}
                error={error}
                setError={setError}
              />
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={() => onOpenChange(false)}>{tCommon('close')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
