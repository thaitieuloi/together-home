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
import { enUS, vi as viLocale } from 'date-fns/locale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
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
    navigate: 'Đường đi',
    message: 'Nhắn tin',
    history: 'Lịch sử',
    battery: 'Pin',
    speed: 'Tốc độ',
    lastSeen: 'Cập nhật',
    noLocation: 'Chưa có vị trí',
    offline: 'Ngoại tuyến',
    online: 'Trực tuyến',
    recent: 'Vừa xong',
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
    offline: 'Offline',
    online: 'Online',
    recent: 'Recently',
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

export default function MemberActionSheet({ member, open, onClose, onNavigate, onMessage, onViewHistory, onUpdate, isAdmin, isSOS }: Props) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = TEXT[language];
  const dateLocale = language === 'vi' ? viLocale : enUS;
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!member || !user || (!open && isDesktop)) return null;

  const loc = member.location;
  const speedKmh = loc?.speed ? loc.speed * 3.6 : null;
  const travelMode = loc ? getTravelMode(speedKmh, loc.is_moving, t) : null;
  const status = member.profile.status;
  const diffMin = loc ? Math.max(0, (Date.now() - new Date(loc.timestamp).getTime()) / 60000) : Infinity;

  const isActuallyOnline = status === 'online' && diffMin < 15;
  const isActuallyIdle = status === 'idle' || (diffMin >= 15 && diffMin < 60);
  const isActuallyOffline = !isActuallyOnline && !isActuallyIdle;

  const freshnessLabel = isActuallyOnline ? t.online : isActuallyIdle ? t.recent : t.offline;
  const freshnessColor = isActuallyOnline ? 'bg-emerald-500' : isActuallyIdle ? 'bg-amber-500' : 'bg-slate-400';

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
    <div className={cn("flex flex-col gap-6", isDesktop && "p-8")}>
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
            <Badge variant="outline" className={cn("text-xs uppercase font-bold px-2.5 h-6 rounded-md", isActuallyOffline ? "text-slate-400 border-slate-200" : "text-emerald-500 border-emerald-500/30 bg-emerald-500/5")}>
              {freshnessLabel}
            </Badge>
            {travelMode && (
              <Badge variant="secondary" className="text-xs uppercase font-bold px-2.5 h-6 rounded-md bg-primary/10 text-primary border-primary/20">
                {travelMode}
              </Badge>
            )}
            {isSOS && <Badge variant="destructive" className="animate-pulse text-xs uppercase font-bold px-2.5 h-6 rounded-md">🆘 SOS</Badge>}
          </div>
        </div>
        {isDesktop && (
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-10 w-10 hover:bg-white/10 shrink-0 self-start">
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
          <StatusCard
            icon={<Clock className="w-5 h-5 text-orange-500" />}
            value={formatDistanceToNow(new Date(loc.timestamp), { addSuffix: false, locale: dateLocale })}
            label={t.lastSeen}
            active={true}
          />
        </div>
      )}

      {/* Main Actions */}
      <div className="flex flex-col gap-3">
        <Button
          onClick={handleNavigate}
          variant="default"
          className="w-full h-14 rounded-2xl font-bold uppercase tracking-widest text-sm gap-3 shadow-xl transition-all active:scale-95"
          disabled={!loc}
        >
          <Navigation className="w-5 h-5 fill-current" />
          {t.navigate}
        </Button>

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

  if (isDesktop) {
    return (
      <div className={cn(
        "fixed z-[1001] bottom-24 left-[calc(20rem+1rem)] w-96 max-h-[85vh] overflow-y-auto",
        "bg-background/80 backdrop-blur-3xl border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] rounded-[40px]",
        "animate-in slide-in-from-left-8 duration-500 ease-out fill-mode-both",
        !open && "animate-out slide-out-to-left-12 fade-out-0 scale-95"
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
      active ? "bg-white/5 border-white/10" : "opacity-30 border-transparent bg-transparent"
    )}>
      <div className="mb-2">{icon}</div>
      <span className="text-sm font-bold text-foreground text-center leading-none mb-1.5">{value}</span>
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">{label}</span>
    </div>
  );
}
