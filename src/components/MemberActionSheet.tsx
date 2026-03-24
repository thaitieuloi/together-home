import { useState, useEffect } from 'react';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
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
  ShieldCheck,
  UserPlus,
  UserMinus,
  ChevronRight,
  ShieldAlert,
  X,
  Share2,
  ExternalLink,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatRelativeTime } from '@/lib/time';
import { enUS, vi as viLocale } from 'date-fns/locale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { reverseGeocode } from '@/lib/geocoding';
import { MapPin, AlertTriangle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

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
  isDesktop?: boolean;
}

const TEXT = {
  vi: {
    navigate: 'Đường đi',
    message: 'Nhắn tin',
    history: 'Lịch sử',
    battery: 'Pin',
    speed: 'Tốc độ',
    lastSeen: 'Cập nhật',
    noLocation: 'Chưa có vị trí',
    offline: 'Đã đăng xuất',
    online: 'Trực tuyến',
    recent: 'Chạy ngầm',
    closed: 'Đã đóng app',
    disconnected: 'Ngoại tuyến',
    lastSeenPrefix: 'Truy cập',
    lastSeenSuffix: 'phút trước',
    justNow: 'Truy cập vừa xong',
    moving: 'Di chuyển',
    stationary: 'Đứng yên',
    walking: 'Đi bộ',
    driving: 'Đang đi xe',
    kmh: 'km/h',
    adminActions: 'Quản trị',
    promote: 'Cấp Admin',
    remove: 'Xóa',
    cannotRemoveSelf: 'Không thể tự xóa',
    error: 'Lỗi',
  },
  en: {
    navigate: 'Directions',
    message: 'Message',
    history: 'History',
    battery: 'Battery',
    speed: 'Speed',
    lastSeen: 'Updated',
    noLocation: 'No location',
    offline: 'Signed out',
    online: 'Online',
    recent: 'Background',
    closed: 'Closed',
    disconnected: 'Disconnected',
    lastSeenPrefix: 'Accessed',
    lastSeenSuffix: 'mins ago',
    justNow: 'Accessed just now',
    moving: 'Moving',
    stationary: 'Stationary',
    walking: 'Walking',
    driving: 'Driving',
    kmh: 'km/h',
    adminActions: 'Admin',
    promote: 'Promote',
    remove: 'Remove',
    cannotRemoveSelf: 'Cannot remove self',
    error: 'Error',
  },
};

function getTravelMode(speedKmh: number | null, isMoving: boolean | null, t: typeof TEXT['vi']) {
  if (!isMoving || !speedKmh) return null;
  if (speedKmh > 40) return t.driving;
  if (speedKmh > 4) return t.walking;
  return t.stationary;
}

export default function MemberActionSheet({
  member,
  open,
  onClose,
  onNavigate,
  onMessage,
  onViewHistory,
  onUpdate,
  isAdmin,
  isSOS,
  isDesktop,
}: Props) {
  const isMobile = useIsMobile();
  const effectiveIsDesktop = isDesktop !== undefined ? isDesktop : !isMobile;
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = TEXT[language];
  const dateLocale = language === 'vi' ? viLocale : enUS;
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [tick, setTick] = useState(0);

  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const timer = setInterval(() => setTick(t => t + 1), 15000);
      return () => clearInterval(timer);
    }
  }, [open]);

  useEffect(() => {
    if (member?.location) {
      reverseGeocode(member.location.latitude, member.location.longitude).then(setAddress);
    } else {
      setAddress(null);
    }
  }, [member?.user_id, member?.location?.latitude, member?.location?.longitude]);

  if (!member || !user || (!open && effectiveIsDesktop)) return null;

  const loc = member.location;
  const speedKmh = loc?.speed ? loc.speed * 3.6 : null;
  const travelMode = loc ? getTravelMode(speedKmh, loc.is_moving, t) : null;
  const status = member.profile.status;
  const locMs = loc ? new Date(loc.timestamp).getTime() : 0;
  const profMs = member.profile.updated_at ? new Date(member.profile.updated_at).getTime() : 0;
  const lastSeenMs = Math.max(locMs, profMs);
  const diffMin = lastSeenMs > 0 ? Math.max(0, (Date.now() - lastSeenMs) / 60000) : Infinity;

  const isActuallyOnline = status === 'online' && diffMin < 1;
  const isActuallyBackground = status === 'idle' && diffMin < 2;
  const isActuallyClosed = (status === 'offline' || (status === 'idle' && diffMin >= 2) || (status === 'online' && diffMin >= 1)) && member.profile.push_token != null && diffMin < 10080;
  const isActuallySignedOut = status === 'offline' && member.profile.push_token == null;

  const formatAccessTime = (min: number) => {
    if (min < 1) return t.justNow;
    if (min < 60) return `${t.lastSeenPrefix} ${Math.round(min)} ${t.lastSeenSuffix}`;
    if (min < 1440) return `${t.lastSeenPrefix} ${Math.round(min / 60)} giờ trước`;
    return `${t.lastSeenPrefix} ${Math.round(min / 1440)} ngày trước`;
  };

  const freshnessLabel = isActuallyOnline 
    ? t.online 
    : (isActuallyBackground || isActuallyClosed) 
        ? formatAccessTime(diffMin)
        : isActuallySignedOut ? t.offline : t.disconnected;
  const freshnessColor = isActuallyOnline ? 'bg-emerald-500' : isActuallyBackground ? 'bg-orange-500' : isActuallyClosed ? 'bg-indigo-400' : 'bg-slate-300';
  const showBadge = !isActuallySignedOut;

  const handleNavigate = () => {
    if (!loc) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}`;
    window.open(url, '_blank');
    onNavigate?.(member);
  };

  const handlePromote = async () => {
    setLoading(true);
    const { error } = await supabase.from('family_members').update({ role: 'admin' }).eq('user_id', member.user_id);
    if (error) toast({ title: t.error, description: error.message, variant: 'destructive' });
    else {
      toast({ title: t.promote });
      onUpdate?.();
      onClose();
    }
    setLoading(false);
  };

  const handleRemove = async () => {
    setLoading(true);
    const { error } = await supabase.from('family_members').delete().eq('user_id', member.user_id);
    if (error) toast({ title: t.error, description: error.message, variant: 'destructive' });
    else {
      toast({ title: t.remove });
      onUpdate?.();
      onClose();
    }
    setLoading(false);
  };

  const Content = (
    <div className={cn("flex flex-col gap-6", effectiveIsDesktop && "p-8")}>
      {/* Header Info */}
      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <Avatar className={cn('w-20 h-20 shadow-2xl transition-all duration-300 ring-2 ring-offset-2 ring-offset-background', isSOS ? 'ring-destructive animate-pulse' : 'ring-primary/20')}>
            {member.profile.avatar_url && <AvatarImage src={member.profile.avatar_url} alt={member.profile.display_name} />}
            <AvatarFallback className="bg-primary text-white text-2xl font-bold">
              {member.profile.display_name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className={cn('absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-background shadow-lg', freshnessColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-2xl font-bold text-foreground uppercase tracking-tight leading-none mb-2 truncate">
            {member.profile.display_name}
          </h3>
          <div className="flex flex-wrap gap-2 align-center">
            {showBadge && (
              <Badge variant="outline" className={cn("text-xs uppercase font-bold px-2.5 h-6 rounded-md shadow-sm", isActuallyOnline ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/5" : (isActuallyBackground ? "text-orange-500 border-orange-500/30" : "text-indigo-400 border-indigo-400/30"))}>
                {freshnessLabel}
              </Badge>
            )}
            {isSOS && <Badge variant="destructive" className="animate-pulse text-xs uppercase font-bold px-2.5 h-6 rounded-md">🆘 SOS</Badge>}
          </div>
          {address && (
            <div className="flex items-start gap-1.5 mt-2 opacity-70">
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
              <p className="text-xs leading-tight line-clamp-2">{address}</p>
            </div>
          )}
        </div>
        {effectiveIsDesktop && (
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-10 w-10 hover:bg-black/5 dark:hover:bg-white/10 shrink-0 self-start">
            <X className="w-5 h-5 opacity-40 hover:opacity-100" />
          </Button>
        )}
      </div>

      {/* Dynamic Status Grid */}
      {loc && (
        <div className="grid grid-cols-3 gap-3">
          <StatusCard
            icon={<Battery className={cn("w-5 h-5", loc.battery_level && loc.battery_level < 20 ? "text-red-500" : "text-emerald-500")} />}
            value={`${loc.battery_level}%`}
            label={t.battery}
            active={loc.battery_level !== null}
          />
          <StatusCard
            icon={<Gauge className="w-5 h-5 text-primary" />}
            value={`${Math.round(speedKmh ?? 0)} ${t.kmh}`}
            label={t.speed}
            active={speedKmh !== null && loc.is_moving}
          />
          {!isActuallySignedOut && (
            <StatusCard
              icon={<Clock className="w-5 h-5 text-orange-500" />}
              value={formatRelativeTime(lastSeenMs, language)}
              label={t.lastSeen}
              active={true}
            />
          )}
        </div>
      )}

      {/* Main Actions */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2 w-full">
          <Button
            onClick={handleNavigate}
            variant="default"
            className="flex-1 h-14 rounded-2xl font-bold uppercase tracking-widest text-sm gap-3 shadow-[0_8px_16px_-4px_rgba(59,130,246,0.3)] dark:shadow-[0_8px_16px_-4px_rgba(0,0,0,0.4)] transition-all active:scale-95"
            disabled={!loc}
          >
            <Navigation className="w-5 h-5 fill-current" />
            {t.navigate}
          </Button>

          {isSOS && (
            <Button
              variant="destructive"
              className="aspect-square h-14 w-14 rounded-2xl p-0 animate-pulse shadow-[0_8px_16px_-4px_rgba(239,68,68,0.4)]"
              onClick={() => {
                toast({ title: 'Người dùng này đang gửi SOS!', description: 'Hãy liên lạc ngay lập tức.' });
              }}
            >
              <AlertTriangle className="w-6 h-6" />
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => { onMessage?.(member); }}
            variant="secondary"
            className="h-14 rounded-2xl font-bold uppercase tracking-widest text-[11px] gap-2 glass glass-light hover:bg-white/20 transition-all active:scale-95 shadow-md"
          >
            <MessageCircle className="w-5 h-5 fill-primary/20" />
            {t.message}
          </Button>
          <Button
            onClick={() => { onViewHistory?.(member); }}
            variant="secondary"
            className="h-14 rounded-2xl font-bold uppercase tracking-widest text-[11px] gap-2 glass glass-light hover:bg-white/20 transition-all active:scale-95 shadow-md"
          >
            <Route className="w-5 h-5" />
            {t.history}
          </Button>
        </div>
      </div>

      {/* Admin Panel */}
      {isAdmin && member.user_id !== user.id && (
        <div className="pt-6 border-t border-white/10">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 px-1">{t.adminActions}</p>
          <div className="flex flex-col gap-2">
            {member.role !== 'admin' && (
              <Button
                variant="ghost"
                className="w-full justify-between h-12 rounded-xl px-4 text-sm font-bold bg-primary/5 hover:bg-primary/10 text-primary group"
                onClick={handlePromote}
                disabled={loading}
              >
                <div className="flex items-center gap-2">
                   <ShieldCheck className="w-5 h-5" />
                   {t.promote}
                </div>
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all" />
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full justify-between h-12 rounded-xl px-4 text-sm font-bold text-destructive hover:bg-destructive/10 group"
              onClick={handleRemove}
              disabled={loading}
            >
              <div className="flex items-center gap-2">
                <UserMinus className="w-5 h-5" />
                {t.remove}
              </div>
              <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  if (effectiveIsDesktop) {
    return (
      <div className={cn(
        "fixed z-[1001] bottom-6 left-[calc(20rem+1.5rem)] w-[420px] max-h-[85vh] overflow-y-auto",
        "bg-card/95 backdrop-blur-2xl border border-border/50 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.15)] rounded-[40px] p-2",
        "animate-in slide-in-from-bottom-8 fade-in-0 duration-500 ease-out fill-mode-both",
        !open && "animate-out slide-out-to-bottom-12 fade-out-0 scale-95"
      )}>
        {Content}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-[40px] p-0 border-t-0 bg-transparent shadow-none">
        <div className="relative w-full bg-background/90 backdrop-blur-3xl p-6 pb-12 rounded-t-[40px] border-t border-white/10 animate-in slide-in-from-bottom duration-500">
          {/* Handle bar */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-1.5 bg-white/20 rounded-full" />
          {Content}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StatusCard({ icon, value, label, active }: { icon: React.ReactNode, value: string, label: string, active: boolean }) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center p-4 rounded-3xl border transition-all shadow-sm",
      active 
        ? "bg-secondary/50 dark:bg-white/5 border-border/50 dark:border-white/10" 
        : "opacity-30 border-transparent bg-transparent"
    )}>
      <div className="mb-2">{icon}</div>
      <span className="text-sm font-bold text-foreground text-center leading-none mb-1.5">{value}</span>
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">{label}</span>
    </div>
  );
}
