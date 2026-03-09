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
    <div className="absolute top-16 right-4 z-[1001] w-[calc(100vw-2rem)] sm:w-80 glass glass-dark rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Bell className="w-4 h-4 text-primary" />
          </div>
          <h3 className="font-semibold text-sm text-foreground">Thông báo</h3>
          {unread.length > 0 && (
            <span className="text-xs bg-destructive text-destructive-foreground px-2 py-0.5 rounded-full font-medium">
              {unread.length}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-2 border-b border-border/50">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
              filter === f.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <f.icon className="w-3 h-3" />
            {f.label}
          </button>
        ))}
      </div>

      {/* Actions bar */}
      {(unread.length > 0 || readCount > 0) && (
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
          {unread.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onMarkAllAsRead} className="h-7 text-xs px-2 rounded-full">
              <CheckCheck className="w-3 h-3 mr-1" />
              Đọc tất cả
            </Button>
          )}
          {readCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onClearAllRead} className="h-7 text-xs px-2 text-destructive hover:text-destructive rounded-full ml-auto">
              <Trash2 className="w-3 h-3 mr-1" />
              Xóa đã đọc
            </Button>
          )}
        </div>
      )}

      {/* Notifications list */}
      <ScrollArea className="max-h-[60vh] sm:max-h-72">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
            {filter === 'all' ? 'Chưa có thông báo nào' : 'Không có thông báo loại này'}
          </div>
        ) : (
          filtered.map((n, i) => (
            <div
              key={n.id}
              className={cn(
                'flex items-start gap-3 p-3 border-b border-border/30 hover:bg-accent/50 transition-all duration-200 group',
                !n.read && 'bg-primary/5',
              )}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                n.type === 'sos' ? 'bg-destructive/10' : 'bg-primary/10'
              )}>
                {n.type === 'sos' 
                  ? <AlertTriangle className="w-4 h-4 text-destructive" />
                  : <Shield className="w-4 h-4 text-primary" />
                }
              </div>
              <button
                className="flex-1 min-w-0 text-left"
                onClick={() => !n.read && onMarkAsRead(n.id)}
              >
                <p className={cn('text-sm leading-tight', !n.read ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                  {n.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: vi })}
                </p>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {!n.read && (
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse-gentle" />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(n.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </ScrollArea>
    </div>
  );
}
