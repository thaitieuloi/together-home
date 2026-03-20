import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Bug, Trash2, Download, Terminal, Circle } from 'lucide-react';
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

const LEVEL_COLORS: Record<string, string> = {
  debug: 'text-slate-500',
  info: 'text-cyan-400',
  warn: 'text-amber-400',
  error: 'text-rose-500 font-bold',
};

const LEVEL_DOT_COLORS: Record<string, string> = {
  debug: 'bg-slate-500',
  info: 'bg-cyan-400',
  warn: 'bg-amber-400',
  error: 'bg-rose-500',
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
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
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
    <div className="absolute top-10 right-4 sm:right-6 md:right-10 z-[1002] w-[calc(100vw-2rem)] sm:w-[600px] md:w-[800px] h-[calc(100vh-6rem)] md:h-[calc(100vh-10rem)] flex flex-col bg-slate-950/90 backdrop-blur-2xl font-mono overflow-hidden rounded-3xl md:rounded-[40px] border border-white/10 shadow-[0_48px_80px_-16px_rgba(0,0,0,0.7)]">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-full bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.3)]" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          </div>
          <div className="flex items-center gap-2 ml-2">
            <Terminal className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-300 tracking-wider uppercase">System Logs</span>
            <Badge className="bg-slate-800 text-slate-300 hover:bg-slate-700 border-none px-1.5 h-4.5 text-[9px]">
              {filtered.length}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10" 
            onClick={handleExport}
          >
            <Download className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10" 
            onClick={handleClear}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10" 
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex items-center gap-1.5 p-3 bg-slate-900/50 border-b border-white/5 shrink-0 overflow-x-auto no-scrollbar">
        <Button
          variant={filter === null ? 'default' : 'ghost'}
          size="sm"
          className={cn(
            "h-7 text-[10px] px-3 font-bold uppercase tracking-widest rounded-md transition-all",
            filter === null ? "bg-slate-100 text-slate-950 hover:bg-white" : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
          )}
          onClick={() => setFilter(null)}
        >
          ALL
        </Button>
        {levels.map((l) => (
          <Button
            key={l}
            variant={filter === l ? 'default' : 'ghost'}
            size="sm"
            className={cn(
              "h-7 text-[10px] px-3 font-bold uppercase tracking-widest rounded-md transition-all gap-1.5",
              filter === l 
                ? "bg-slate-100 text-slate-950 hover:bg-white" 
                : cn("bg-white/[0.03] border border-white/5 hover:bg-white/10 hover:border-white/10", LEVEL_COLORS[l])
            )}
            onClick={() => setFilter(filter === l ? null : l)}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", filter === l ? "bg-slate-950" : LEVEL_DOT_COLORS[l])} />
            {l}
          </Button>
        ))}
      </div>

      {/* Terminal View */}
      <ScrollArea className="flex-1 bg-slate-950/40" ref={scrollRef}>
        <div className="p-4 space-y-1.5 min-w-max">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-20">
              <Bug className="w-12 h-12" />
              <p className="text-xs font-bold uppercase tracking-[0.3em]">No Logs Detected</p>
            </div>
          )}
          {filtered.map((log) => (
            <div key={log.id} className="flex gap-4 py-1 border-b border-white/[0.02] hover:bg-white/[0.03] transition-colors group">
              <span className="text-slate-600 text-[10px] tabular-nums shrink-0 pt-0.5">
                {log.timestamp.slice(11, 23)}
              </span>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-[10px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-tighter shrink-0 border",
                    log.level === 'error' ? "bg-rose-500/20 border-rose-500/30 text-rose-400" :
                    log.level === 'warn' ? "bg-amber-500/20 border-amber-500/30 text-amber-400" :
                    log.level === 'info' ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-400" :
                    "bg-slate-500/20 border-slate-500/30 text-slate-500"
                  )}>
                    {log.level}
                  </span>
                  <span className={cn("text-xs leading-relaxed break-all", LEVEL_COLORS[log.level])}>
                    {log.message}
                  </span>
                </div>
                {log.context && (
                  <div className="bg-white/[0.03] rounded-md p-2 ml-14 group-hover:bg-white/[0.05] transition-colors">
                    <pre className="text-[10px] text-slate-500 whitespace-pre-wrap leading-normal">
                      {JSON.stringify(log.context, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
