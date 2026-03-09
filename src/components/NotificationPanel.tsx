import { useState } from 'react';
import { Notification } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Bell, CheckCheck, X, Trash2, Shield, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type FilterType = 'all' | 'geofence' | 'sos';

interface Props {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (id: string) => void;
  onClearAllRead: () => void;
  onClose: () => void;
}

export default function NotificationPanel({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onClearAllRead,
  onClose,
}: Props) {
  const [filter, setFilter] = useState<FilterType>('all');

  const filtered = filter === 'all'
    ? notifications
    : notifications.filter((n) => n.type === filter);

  const unread = notifications.filter((n) => !n.read);
  const readCount = notifications.filter((n) => n.read).length;

  const filters: { key: FilterType; label: string; icon: typeof Bell }[] = [
    { key: 'all', label: 'Tất cả', icon: Bell },
    { key: 'geofence', label: 'Vùng an toàn', icon: Shield },
    { key: 'sos', label: 'SOS', icon: AlertTriangle },
  ];

  return (
    <div className="absolute top-16 right-4 z-[1001] w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground">Thông báo</h3>
          {unread.length > 0 && (
            <span className="text-xs bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">
              {unread.length}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-2 border-b border-border">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors',
              filter === f.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            <f.icon className="w-3 h-3" />
            {f.label}
          </button>
        ))}
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30">
        {unread.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onMarkAllAsRead} className="h-6 text-[11px] px-2">
            <CheckCheck className="w-3 h-3 mr-1" />
            Đọc tất cả
          </Button>
        )}
        {readCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearAllRead} className="h-6 text-[11px] px-2 text-destructive hover:text-destructive">
            <Trash2 className="w-3 h-3 mr-1" />
            Xóa đã đọc
          </Button>
        )}
      </div>

      {/* Notifications list */}
      <ScrollArea className="max-h-72">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            {filter === 'all' ? 'Chưa có thông báo nào' : 'Không có thông báo loại này'}
          </div>
        ) : (
          filtered.map((n) => (
            <div
              key={n.id}
              className={cn(
                'flex items-start gap-2 p-3 border-b border-border/50 hover:bg-accent/50 transition-colors group',
                !n.read && 'bg-primary/5'
              )}
            >
              <button
                className="flex-1 min-w-0 text-left"
                onClick={() => !n.read && onMarkAsRead(n.id)}
              >
                <p className={cn('text-sm', !n.read ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                  {n.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[10px] text-muted-foreground/70">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: vi })}
                  </p>
                  <span className={cn(
                    'text-[9px] px-1 py-0.5 rounded font-medium',
                    n.type === 'geofence' ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
                  )}>
                    {n.type === 'geofence' ? 'Vùng an toàn' : 'SOS'}
                  </span>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {!n.read && (
                  <span className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(n.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </ScrollArea>
    </div>
  );
}
