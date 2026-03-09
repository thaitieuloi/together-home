import { Notification } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Props {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClose: () => void;
}

export default function NotificationPanel({ notifications, onMarkAsRead, onMarkAllAsRead, onClose }: Props) {
  const unread = notifications.filter((n) => !n.read);

  return (
    <div className="absolute top-16 right-4 z-[1001] w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
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
        <div className="flex items-center gap-1">
          {unread.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onMarkAllAsRead} className="h-7 text-xs">
              <CheckCheck className="w-3 h-3 mr-1" />
              Đọc tất cả
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="max-h-80">
        {notifications.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            Chưa có thông báo nào
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.read && onMarkAsRead(n.id)}
              className={cn(
                'w-full text-left p-3 border-b border-border/50 hover:bg-accent/50 transition-colors',
                !n.read && 'bg-primary/5'
              )}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm', !n.read ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                    {n.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: vi })}
                  </p>
                </div>
                {!n.read && (
                  <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                )}
              </div>
            </button>
          ))
        )}
      </ScrollArea>
    </div>
  );
}
