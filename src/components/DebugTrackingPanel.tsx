import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Bug, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TrackingLogEntry {
  id: number;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
}

const LEVEL_STYLES: Record<string, string> = {
  debug: 'text-muted-foreground',
  info: 'text-blue-500',
  warn: 'text-amber-500',
  error: 'text-red-500',
};

const LEVEL_BADGE: Record<string, string> = {
  debug: 'bg-muted text-muted-foreground',
  info: 'bg-blue-500/10 text-blue-500',
  warn: 'bg-amber-500/10 text-amber-500',
  error: 'bg-red-500/10 text-red-500',
};

let logIdCounter = 0;
const logBuffer: TrackingLogEntry[] = [];
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

// Intercept console methods to capture [LocationTracking] logs
const originalMethods = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

function interceptLevel(level: 'debug' | 'info' | 'warn' | 'error') {
  const original = originalMethods[level];
  console[level] = (...args: unknown[]) => {
    original.apply(console, args);

    const firstArg = typeof args[0] === 'string' ? args[0] : '';
    if (!firstArg.includes('[LocationTracking]')) return;

    const entry: TrackingLogEntry = {
      id: ++logIdCounter,
      timestamp: new Date().toISOString(),
      level,
      message: firstArg.replace('[LocationTracking] ', ''),
      context: args[1] && typeof args[1] === 'object' ? (args[1] as Record<string, unknown>) : undefined,
    };

    logBuffer.push(entry);
    if (logBuffer.length > 500) logBuffer.shift();
    notifyListeners();
  };
}

// Install interceptors once
interceptLevel('debug');
interceptLevel('info');
interceptLevel('warn');
interceptLevel('error');

interface Props {
  onClose: () => void;
}

export default function DebugTrackingPanel({ onClose }: Props) {
  const [logs, setLogs] = useState<TrackingLogEntry[]>([...logBuffer]);
  const [filter, setFilter] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const refresh = useCallback(() => {
    setLogs([...logBuffer]);
  }, []);

  useEffect(() => {
    listeners.add(refresh);
    return () => { listeners.delete(refresh); };
  }, [refresh]);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const filtered = filter ? logs.filter((l) => l.level === filter) : logs;

  const handleClear = () => {
    logBuffer.length = 0;
    setLogs([]);
  };

  const handleExport = () => {
    const text = filtered.map((l) => {
      const ctx = l.context ? ' ' + JSON.stringify(l.context) : '';
      return `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}${ctx}`;
    }).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tracking-log-${new Date().toISOString().slice(0, 16)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const levels = ['debug', 'info', 'warn', 'error'] as const;

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">Debug Tracking</span>
          <Badge variant="secondary" className="text-[10px]">{filtered.length}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExport} title="Export">
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClear} title="Clear">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-2 border-b border-border/30">
        <Button
          variant={filter === null ? 'default' : 'ghost'}
          size="sm"
          className="h-6 text-[10px] px-2 rounded-full"
          onClick={() => setFilter(null)}
        >
          All
        </Button>
        {levels.map((l) => (
          <Button
            key={l}
            variant={filter === l ? 'default' : 'ghost'}
            size="sm"
            className={cn('h-6 text-[10px] px-2 rounded-full', filter !== l && LEVEL_STYLES[l])}
            onClick={() => setFilter(filter === l ? null : l)}
          >
            {l.toUpperCase()}
          </Button>
        ))}
      </div>

      {/* Log list */}
      <ScrollArea className="flex-1" ref={scrollRef as any}>
        <div className="p-2 space-y-0.5 font-mono text-[11px]">
          {filtered.length === 0 && (
            <p className="text-muted-foreground text-center py-8 text-xs">
              No tracking logs yet. Enable location tracking to see logs.
            </p>
          )}
          {filtered.map((log) => (
            <div key={log.id} className="flex gap-1.5 py-0.5 hover:bg-accent/50 rounded px-1">
              <span className="text-muted-foreground/60 shrink-0">
                {log.timestamp.slice(11, 23)}
              </span>
              <span className={cn('shrink-0 w-11 text-right', LEVEL_BADGE[log.level])}>
                {log.level.toUpperCase().slice(0, 3)}
              </span>
              <span className={cn('flex-1 break-all', LEVEL_STYLES[log.level])}>
                {log.message}
                {log.context && (
                  <span className="text-muted-foreground/50 ml-1">
                    {JSON.stringify(log.context).slice(0, 200)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
