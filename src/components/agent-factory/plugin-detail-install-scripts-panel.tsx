'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Terminal, Copy } from 'lucide-react';

export interface InstallScripts {
  npm?: string;
  pnpm?: string;
  yarn?: string;
  pip?: string;
  poetry?: string;
  cargo?: string;
  go?: string;
  dockerfile?: string;
}

const SCRIPT_TAB_ORDER = ['npm', 'pnpm', 'yarn', 'pip', 'poetry', 'cargo', 'go', 'docker'] as const;

function getScriptKey(tab: string): keyof InstallScripts {
  return tab === 'docker' ? 'dockerfile' : (tab as keyof InstallScripts);
}

function getFirstAvailableTab(scripts: InstallScripts): string {
  for (const tab of SCRIPT_TAB_ORDER) {
    if (scripts[getScriptKey(tab)]) return tab;
  }
  return '';
}

function getScriptTabLabel(tab: string) {
  return tab === 'docker' ? 'Docker' : tab;
}

interface ScriptTabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function ScriptTabButton({ label, active, onClick }: ScriptTabButtonProps) {
  return (
    <button
      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-background text-foreground border-b-2 border-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

interface PluginDetailInstallScriptsPanelProps {
  scripts: InstallScripts;
}

export function PluginDetailInstallScriptsPanel({
  scripts,
}: PluginDetailInstallScriptsPanelProps) {
  const t = useTranslations('agentFactory');
  const [activeTab, setActiveTab] = useState<string>(() => getFirstAvailableTab(scripts));
  const [copiedScript, setCopiedScript] = useState<string | null>(null);

  const handleCopy = () => {
    const script = scripts[activeTab as keyof InstallScripts];
    if (script) {
      navigator.clipboard.writeText(script);
      setCopiedScript(activeTab);
      setTimeout(() => setCopiedScript(null), 2000);
    }
  };

  const hasAnyScript = Object.values(scripts).some((v) => v);
  if (!hasAnyScript) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Terminal className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">{t('installScripts')}</h4>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="flex border-b bg-muted/50">
          {SCRIPT_TAB_ORDER.map((tab) => {
            if (!scripts[getScriptKey(tab)]) return null;
            return (
              <ScriptTabButton
                key={tab}
                label={getScriptTabLabel(tab)}
                active={activeTab === tab}
                onClick={() => setActiveTab(tab)}
              />
            );
          })}
        </div>

        <div className="relative group">
          <pre className="text-xs bg-muted p-3 overflow-x-auto">
            <code>
              {activeTab === 'docker' && scripts.dockerfile
                ? scripts.dockerfile.split('\n').map((line, i) => <div key={i}>{line}</div>)
                : scripts[activeTab as keyof InstallScripts] || ''}
            </code>
          </pre>
          <Button
            size="sm"
            variant="ghost"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleCopy}
          >
            {copiedScript === activeTab ? (
              <span className="text-green-500 text-xs">Copied!</span>
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
