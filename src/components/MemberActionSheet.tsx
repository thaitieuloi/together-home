import { useState } from 'react';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Navigation,
  MessageCircle,
  Route,
  Battery,
  BatteryLow,
  BatteryWarning,
  Clock,
  Gauge,
  WifiOff,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, vi as viLocale } from 'date-fns/locale';
import { useLanguage } from '@/contexts/LanguageContext';
import PageTransition from '@/components/PageTransition';
import { useAuth } from '@/hooks/useAuth';
import {
  ShieldCheck,
  UserPlus,
  UserMinus,
  Trash2,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Props {
  member: FamilyMemberWithProfile | null;
  open: boolean;
  onClose: () => void;
  onNavigate?: (member: FamilyMemberWithProfile) => void;
  onMessage?: (member: FamilyMemberWithProfile) => void;
  onViewHistory?: (member: FamilyMemberWithProfile) => void;
  onUpdate?: () => void;
  isAdmin?: boolean;
  isSOS?: boolean;
}

const TEXT = {
  vi: {
    navigate: 'Dẫn đường đến đây',
    message: 'Nhắn tin',
    history: 'Xem lịch sử di chuyển',
    battery: 'Pin',
    speed: 'Tốc độ',
    lastSeen: 'Cập nhật lần cuối',
    noLocation: 'Chưa có vị trí',
    offline: 'Offline',
    offlineSince: 'Offline từ',
    online: 'Online',
    recent: 'Gần đây',
    moving: 'Đang di chuyển',
    stationary: 'Đứng yên',
    walking: '🚶 Đi bộ',
    driving: '🚗 Đang lái xe',
    kmh: 'km/h',
    adminActions: 'Quyền quản trị',
    promote: 'Cấp quyền Admin',
    remove: 'Xóa thành viên',
    cannotRemoveSelf: 'Không thể tự xóa chính mình',
    error: 'Lỗi',
  },
  en: {
    navigate: 'Navigate Here',
    message: 'Message',
    history: 'View Location History',
    battery: 'Battery',
    speed: 'Speed',
    lastSeen: 'Last updated',
    noLocation: 'No location yet',
    offline: 'Offline',
    offlineSince: 'Offline since',
    online: 'Online',
    recent: 'Recently active',
    moving: 'Moving',
    stationary: 'Stationary',
    walking: '🚶 Walking',
    driving: '🚗 Driving',
    kmh: 'km/h',
    adminActions: 'Admin Actions',
    promote: 'Promote to Admin',
    remove: 'Remove member',
    cannotRemoveSelf: 'Cannot remove self',
    error: 'Error',
  },
};

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getBatteryInfo(level: number | null) {
  if (level === null || level === undefined) return null;
  if (level < 20) return { color: 'text-red-500', Icon: BatteryLow, bg: 'bg-red-500/10', pulse: true };
  if (level < 50) return { color: 'text-amber-500', Icon: BatteryWarning, bg: 'bg-amber-500/10', pulse: false };
  return { color: 'text-emerald-500', Icon: Battery, bg: 'bg-emerald-500/10', pulse: false };
}

function getTravelMode(speedKmh: number | null, isMoving: boolean | null, t: typeof TEXT['vi']) {
  if (!isMoving || !speedKmh) return null;
  if (speedKmh > 40) return t.driving;
  return t.walking;
}

export default function MemberActionSheet({ member, open, onClose, onNavigate, onMessage, onViewHistory, onUpdate, isAdmin, isSOS }: Props) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = TEXT[language];
  const dateLocale = language === 'vi' ? viLocale : enUS;
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);

  if (!member || !user) return null;

  const loc = member.location;
  const batteryInfo = loc ? getBatteryInfo(loc.battery_level) : null;
  const speedKmh = loc?.speed ? loc.speed * 3.6 : null;
  const travelMode = loc ? getTravelMode(speedKmh, loc.is_moving, t) : null;

  const status = member.profile.status;
  const diffMin = loc
    ? Math.max(0, (Date.now() - new Date(loc.timestamp).getTime()) / 60000)
    : Infinity;

  const isActuallyOnline = status === 'online' && diffMin < 15;
  const isActuallyIdle = status === 'idle' || (diffMin >= 15 && diffMin < 60);
  const isActuallyOffline = !isActuallyOnline && !isActuallyIdle;

  const freshnessLabel = isActuallyOnline
    ? t.online
    : isActuallyIdle
    ? t.recent
    : t.offline;

  const freshnessColor = isActuallyOnline
    ? 'bg-emerald-500'
    : isActuallyIdle
    ? 'bg-amber-500'
    : 'bg-slate-400';

  const freshnessTextClass = isActuallyOnline
    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    : isActuallyIdle
    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    : 'bg-slate-500/10 text-slate-500 dark:text-slate-400';

  const handleNavigate = () => {
    if (!loc) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}`;
    window.open(url, '_blank');
    onNavigate?.(member);
    onClose();
  };

  const handleMessage = () => {
    onMessage?.(member);
    onClose();
  };

  const handleHistory = () => {
    onViewHistory?.(member);
    onClose();
  };

  const handlePromote = async () => {
    if (!member) return;
    setLoading(true);
    const { error } = await supabase
      .from('family_members')
      .update({ role: 'admin' })
      .eq('user_id', member.user_id);
    
    if (error) {
      toast({ title: t.error, description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t.promote });
      onUpdate?.();
      onClose();
    }
    setLoading(false);
  };

  const handleRemove = async () => {
    if (!member) return;
    setLoading(true);
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('user_id', member.user_id);

    if (error) {
      toast({ title: t.error, description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t.remove });
      onUpdate?.();
      onClose();
    }
    setLoading(false);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <SheetHeader className="mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className={cn('w-14 h-14', isActuallyOffline && 'opacity-60', isSOS && 'ring-2 ring-destructive ring-offset-2 animate-pulse')}>
                {member.profile.avatar_url ? (
                  <AvatarImage src={member.profile.avatar_url} alt={member.profile.display_name} />
                ) : null}
                <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                  {getInitials(member.profile.display_name)}
                </AvatarFallback>
              </Avatar>
              <span
                className={cn(
                  'absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-background',
                  freshnessColor
                )}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-left text-lg leading-tight truncate mr-2">
                  {member.profile.display_name}
                </SheetTitle>
                {isSOS && (
                  <Badge variant="destructive" className="animate-pulse uppercase font-bold shrink-0">SOS</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-xs',
                    freshnessTextClass
                  )}
                >
                  {isActuallyOffline ? <WifiOff className="w-3 h-3 mr-1" /> : null}
                  {freshnessLabel}
                </Badge>
                {travelMode && (
                  <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    {travelMode}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* Info grid */}
        {loc && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {batteryInfo && (
              <div className={cn('flex flex-col items-center gap-1 rounded-xl p-3', batteryInfo.bg)}>
                <batteryInfo.Icon
                  className={cn('w-5 h-5', batteryInfo.color, batteryInfo.pulse && 'animate-pulse')}
                />
                <span className={cn('text-sm font-semibold', batteryInfo.color)}>
                  {loc.battery_level}%
                </span>
                <span className="text-xs text-muted-foreground">{t.battery}</span>
              </div>
            )}

            {speedKmh !== null && loc.is_moving && (
              <div className="flex flex-col items-center gap-1 rounded-xl p-3 bg-blue-500/10">
                <Gauge className="w-5 h-5 text-blue-500" />
                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                  {Math.round(speedKmh)} {t.kmh}
                </span>
                <span className="text-xs text-muted-foreground">{t.speed}</span>
              </div>
            )}

            <div className="flex flex-col items-center gap-1 rounded-xl p-3 bg-muted/60">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <span className="text-xs font-medium text-center text-foreground leading-tight">
                {formatDistanceToNow(new Date(loc.timestamp), { addSuffix: true, locale: dateLocale })}
              </span>
              <span className="text-xs text-muted-foreground">{t.lastSeen}</span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2">
          <Button
            className="w-full justify-start gap-3"
            variant="default"
            disabled={!loc}
            onClick={handleNavigate}
          >
            <Navigation className="w-4 h-4" />
            {t.navigate}
          </Button>

          <Button
            className="w-full justify-start gap-3"
            variant="outline"
            onClick={handleMessage}
          >
            <MessageCircle className="w-4 h-4" />
            {t.message}
          </Button>

          <Button
            className="w-full justify-start gap-3"
            variant="outline"
            onClick={handleHistory}
          >
            <Route className="w-4 h-4" />
            {t.history}
          </Button>

          {/* Admin actions */}
          {isAdmin && member.user_id !== user.id && (
            <div className="pt-4 mt-2 border-t border-border/50">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-1">{t.adminActions}</p>
              <div className="grid grid-cols-2 gap-2">
                {member.role !== 'admin' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 text-primary border-primary/20 hover:bg-primary/5 rounded-xl gap-2"
                    onClick={handlePromote}
                    disabled={loading}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span className="text-xs">{t.promote}</span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 text-destructive border-destructive/20 hover:bg-destructive/5 rounded-xl gap-2"
                  onClick={handleRemove}
                  disabled={loading}
                >
                  <UserMinus className="w-3.5 h-3.5" />
                  <span className="text-xs">{t.remove}</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
