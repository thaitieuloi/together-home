import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Clock,
  Copy,
  LogOut,
  Users,
  ChevronLeft,
  ChevronRight,
  Settings,
  Moon,
  Sun,
  Radio,
  Trash2,
  Route,
  Battery,
  BatteryLow,
  BatteryWarning,
  Gauge,
  WifiOff,
  ShieldCheck,
  AlertTriangle,
  ChevronRightIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { enUS, vi } from 'date-fns/locale';
import { formatRelativeTime, getServerNow } from '@/lib/time';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from './ui/scroll-area';

const SIDEBAR_TEXT = {
  vi: {
    online: 'Trực tuyến',
    background: 'Đang chạy ngầm',
    closed: 'Đã đóng app',
    offline: 'Thoát hệ thống',
    disconnected: 'Ngoại tuyến',
    lastSeenPrefix: 'Truy cập',
    lastSeenSuffix: 'phút trước',
    justNow: 'Truy cập vừa xong',
    copied: 'Đã sao chép mã mời!',
    removeError: 'Không thể xóa thành viên',
    removed: 'Đã xóa',
    members: 'Thành viên gia đình',
    noLocation: 'Chưa có vị trí',
    viewTrip: 'Xem lịch sử',
    removeMember: 'Xóa thành viên',
    lightMode: 'Sáng',
    darkMode: 'Tối',
    settings: 'Cài đặt',
    signOut: 'Đăng xuất',
    removeMemberTitle: 'Xóa thành viên',
    removeMemberConfirm: 'Bạn có chắc muốn xóa',
    fromFamily: 'khỏi gia đình?',
    cancel: 'Hủy',
    remove: 'Xóa',
    familyId: 'ID Gia đình',
  },
  en: {
    online: 'Online',
    background: 'Background',
    closed: 'App closed',
    offline: 'Signed out',
    disconnected: 'Disconnected',
    lastSeenPrefix: 'Accessed',
    lastSeenSuffix: 'mins ago',
    justNow: 'Accessed just now',
    copied: 'Invite code copied!',
    removeError: 'Unable to remove member',
    removed: 'Removed',
    members: 'Family Members',
    noLocation: 'No location yet',
    viewTrip: 'Movement history',
    removeMember: 'Remove member',
    lightMode: 'Light',
    darkMode: 'Dark',
    settings: 'Settings',
    signOut: 'Sign out',
    removeMemberTitle: 'Remove member',
    removeMemberConfirm: 'Are you sure you want to remove',
    fromFamily: 'from this family?',
    cancel: 'Cancel',
    remove: 'Remove',
    familyId: 'Family ID',
  },
};

function getStatusInfo(
  status: 'online' | 'idle' | 'offline' | 'logged_out',
  locationTime: string | undefined,
  profileTime: string | undefined,
  language: 'vi' | 'en',
  hasPushToken: boolean
) {
  const text = SIDEBAR_TEXT[language];
  const now = getServerNow().getTime();
  
  const locMs = locationTime ? new Date(locationTime).getTime() : 0;
  const profMs = profileTime ? new Date(profileTime).getTime() : 0;
  const lastSeenMs = Math.max(locMs, profMs);
  
  const diffMs = lastSeenMs > 0 ? Math.max(0, now - lastSeenMs) : Infinity;
  const diffMin = diffMs / 60000;
  
  const formatAccessTime = (min: number) => {
    if (min < 1) return text.justNow;
    if (min < 60) return `${text.lastSeenPrefix} ${Math.round(min)} ${text.lastSeenSuffix}`;
    if (min < 1440) return `${text.lastSeenPrefix} ${Math.round(min / 60)} giờ trước`;
    return `${text.lastSeenPrefix} ${Math.round(min / 1440)} ngày trước`;
  };

  const isActuallyOnline = status === 'online' && diffMin < 1;
  const isActuallyBackground = status === 'idle' && diffMin < 2;
  const isActuallySignedOut = status === 'logged_out'; // Logout chủ động
  const isActuallyClosed = status === 'offline' || (status === 'idle' && diffMin >= 2) || (status === 'online' && diffMin >= 1); // Swipe thoát hoặc timeout app

  if (isActuallyOnline) {
    return {
      color: 'bg-emerald-500',
      label: text.online,
      ring: 'ring-emerald-500/20',
      textClass: 'text-emerald-500',
      isOffline: false,
    };
  }

  if (isActuallyBackground) {
    return {
      color: 'bg-orange-500',
      label: formatAccessTime(diffMin),
      ring: 'ring-orange-500/20',
      textClass: 'text-orange-500',
      isOffline: false,
    };
  }

  if (isActuallyClosed) {
    return {
      color: 'bg-indigo-400',
      label: formatAccessTime(diffMin),
      ring: 'ring-indigo-400/10',
      textClass: 'text-indigo-400',
      isOffline: true,
    };
  }

  if (isActuallySignedOut) {
    return {
      color: 'bg-slate-300',
      label: text.offline,
      ring: 'ring-slate-300/10',
      textClass: 'text-slate-400',
      isOffline: true,
      isSignedOut: true,
    };
  }

  return {
    color: 'bg-slate-300',
    label: text.disconnected,
    ring: 'ring-slate-300/10',
    textClass: 'text-slate-400',
    isOffline: true,
  };
}

function getBatteryInfo(level: number | null) {
  if (level === null || level === undefined) return null;
  if (level < 20) return { color: 'text-red-500', bg: 'bg-red-500/10', Icon: BatteryLow, pulse: true };
  if (level < 50) return { color: 'text-amber-500', bg: 'bg-amber-500/10', Icon: BatteryWarning, pulse: false };
  return { color: 'text-emerald-500', bg: 'bg-emerald-500/10', Icon: Battery, pulse: false };
}

interface Props {
  family: Tables<'families'>;
  members: FamilyMemberWithProfile[];
  onMemberClick: (member: FamilyMemberWithProfile) => void;
  onSignOut: () => void;
  onOpenProfile?: () => void;
  onOpenFamilyAdmin?: () => void;
  onShowTrip?: (member: FamilyMemberWithProfile) => void;
  recentlyUpdated?: Set<string>;
  liveSharingUserIds?: Set<string>;
  onMemberRemoved?: () => void;
  activeSOSUserIds?: Set<string>;
  selectedMemberId?: string;
}

export default function FamilySidebar({
  family,
  members,
  onMemberClick,
  onSignOut,
  onOpenProfile,
  onOpenFamilyAdmin,
  onShowTrip,
  recentlyUpdated = new Set(),
  liveSharingUserIds = new Set(),
  onMemberRemoved,
  activeSOSUserIds = new Set(),
  selectedMemberId,
}: Props) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const text = SIDEBAR_TEXT[language];
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [removingMember, setRemovingMember] = useState<FamilyMemberWithProfile | null>(null);

  const isAdmin = members.find((m) => m.user_id === user?.id)?.role === 'admin';

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 15000); // Check every 15s to be safe
    return () => clearInterval(timer);
  }, []);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const copyInviteCode = () => {
    navigator.clipboard.writeText(family.invite_code);
    toast({ title: text.copied });
  };

  const handleRemoveMember = async () => {
    if (!removingMember) return;
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('user_id', removingMember.user_id)
      .eq('family_id', family.id);

    if (error) {
      toast({ title: 'Error', description: text.removeError, variant: 'destructive' });
    } else {
      toast({ title: `${text.removed} ${removingMember.profile.display_name}` });
      onMemberRemoved?.();
    }
    setRemovingMember(null);
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-orange-500', 'bg-violet-500', 'bg-pink-500', 'bg-teal-500'];

  const sortedMembers = [...members].sort((a, b) => 
    a.profile.display_name.localeCompare(b.profile.display_name)
  );

  if (collapsed) {
    return (
      <div className="w-16 h-full bg-background/80 backdrop-blur-xl border-r flex flex-col items-center py-6 gap-5 shadow-2xl relative z-10">
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} className="rounded-full h-8 w-8 hover:bg-primary/10 hover:text-primary transition-all">
          <ChevronRight className="w-4 h-4" />
        </Button>
        <ScrollArea className="flex-1 w-full">
          <div className="flex flex-col items-center gap-4 py-2">
            {sortedMembers.map((m, i) => {
              const freshness = getStatusInfo(m.profile.status, m.location?.timestamp, m.profile.updated_at, language, !!m.profile.push_token);
              const isSOS = activeSOSUserIds.has(m.user_id);
              return (
                <button
                  key={m.user_id}
                  onClick={() => onMemberClick(m)}
                  className="relative group transition-transform active:scale-95"
                >
                  <Avatar
                    className={cn(
                      'w-10 h-10 ring-2 ring-offset-2 ring-offset-background border-2 border-transparent transition-all duration-300',
                      isSOS ? 'ring-destructive animate-pulse' : (freshness ? `ring-${freshness.color.replace('bg-', '')}/40` : 'ring-transparent'),
                      freshness?.isOffline && 'opacity-60 grayscale-[0.5]'
                    )}
                  >
                    {m.profile.avatar_url ? <AvatarImage src={m.profile.avatar_url} alt={m.profile.display_name} /> : null}
                    <AvatarFallback className={cn('text-[10px] font-bold text-white', colors[i % colors.length])}>
                      {getInitials(m.profile.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background shadow-sm',
                      isSOS ? 'bg-destructive' : freshness?.color
                    )}
                  />
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:flex w-80 h-full bg-background/80 backdrop-blur-3xl border-r flex-col overflow-hidden shadow-2xl animate-in slide-in-from-left duration-500 relative z-10">
        {/* Header - Profile & Family Info */}
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-foreground uppercase tracking-tight truncate leading-tight">{family.name}</h2>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">{text.familyId}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCollapsed(true)} className="h-8 w-8 rounded-full opacity-50 hover:opacity-100 hover:bg-primary/10 hover:text-primary transition-all">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </div>

          <div 
            onClick={copyInviteCode}
            className="group flex flex-col gap-2 p-4 bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-2xl cursor-pointer transition-all active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-primary uppercase tracking-widest leading-none">Mã mời gia đình</span>
              <button className="p-1 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <Copy className="w-3.5 h-3.5 text-primary" />
              </button>
            </div>
            <p className="font-mono text-xl font-bold tracking-[0.2em] text-foreground leading-none">{family.invite_code}</p>
          </div>
        </div>

        {/* Member List */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-6 py-3 flex items-center justify-between border-b border-white/5">
            <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">
              {text.members} <span className="text-primary/70 ml-1">({members.length})</span>
            </span>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="space-y-1 p-3 pb-8">
              {sortedMembers.map((m, i) => {
                const freshness = getStatusInfo(m.profile.status, m.location?.timestamp, m.profile.updated_at, language, !!m.profile.push_token);
                const isUpdated = recentlyUpdated.has(m.user_id);
                const isSOS = activeSOSUserIds.has(m.user_id);
                const isLive = liveSharingUserIds.has(m.user_id);
                const battery = getBatteryInfo(m.location?.battery_level ?? null);

                return (
                  <div key={m.user_id} className="group relative">
                    <button
                      onClick={() => onMemberClick(m)}
                      className={cn(
                        "w-full flex items-center gap-4 p-3.5 rounded-2xl transition-all duration-500 text-left border shadow-sm",
                        selectedMemberId === m.user_id
                          ? "bg-primary/5 border-primary shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-2 ring-primary/20"
                          : isSOS 
                            ? "bg-destructive/10 border-destructive/30" 
                            : "hover:bg-white/40 dark:hover:bg-white/5 hover:border-white/20 border-transparent active:scale-[0.98] bg-white/10 dark:bg-white-[0.02]"
                      )}
                    >
                      {/* Avatar with Status */}
                      <div className="relative shrink-0">
                        <Avatar
                          className={cn(
                            'w-14 h-14 transition-all duration-500 group-hover:scale-105 border-2 border-background',
                            isSOS ? 'ring-4 ring-destructive/40 animate-pulse' : (freshness ? `ring-2 ${freshness.ring}` : ''),
                            isUpdated && 'animate-bounce-subtle ring-4 ring-primary/30',
                            freshness?.isOffline && 'opacity-70 grayscale-[0.3]'
                          )}
                        >
                          {m.profile.avatar_url ? <AvatarImage src={m.profile.avatar_url} alt={m.profile.display_name} /> : null}
                          <AvatarFallback className={cn('text-lg font-bold text-white', colors[i % colors.length])}>
                            {getInitials(m.profile.display_name)}
                          </AvatarFallback>
                        </Avatar>
                        {isSOS ? (
                          <div className="absolute -bottom-1 -right-1 bg-destructive rounded-full p-1.5 border-2 border-background shadow-lg">
                            <AlertTriangle className="w-3.5 h-3.5 text-white" />
                          </div>
                        ) : (
                          <span
                            className={cn(
                              'absolute -bottom-0.5 -right-0.5 w-4.5 h-4.5 rounded-full border-2 border-background shadow-md transition-colors',
                              freshness?.color || 'bg-slate-300'
                            )}
                          />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className={cn(
                            "text-base font-bold tracking-tight truncate",
                            isSOS ? "text-destructive" : "text-foreground"
                          )}>
                            {m.profile.display_name}
                          </p>
                          {m.role === 'admin' && (
                            <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                          )}
                          {isSOS && (
                            <Badge variant="destructive" className="h-4 px-1.5 text-[9px] font-bold uppercase animate-pulse">SOS</Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('text-[11px] font-bold uppercase tracking-wider shrink-0', freshness?.textClass)}>
                            {isLive ? (
                              <span className="flex items-center gap-1 text-primary">
                                <Radio className="w-3.5 h-3.5 animate-pulse" /> LIVE
                              </span>
                            ) : freshness?.label}
                          </span>

                          {!freshness?.isSignedOut && (
                            <>
                              <span className="text-muted-foreground/30">•</span>
                              <div className="flex items-center gap-1.5 overflow-hidden">
                                <Clock className="w-3 h-3 shrink-0 opacity-40 text-muted-foreground" />
                                <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                                  {(() => {
                                    const locTime = m.location?.timestamp ? new Date(m.location.timestamp).getTime() : 0;
                                    const profileTime = m.profile.updated_at ? new Date(m.profile.updated_at).getTime() : 0;
                                    const bestTime = Math.max(locTime, profileTime);
                                    return bestTime > 0 ? formatRelativeTime(bestTime, language) : text.noLocation;
                                  })()}
                                </span>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-2">
                          {m.location?.is_moving && m.location?.speed && m.location.speed > 3 && (
                            <div className={cn(
                              'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tight shrink-0',
                              m.location.speed > 40
                                ? 'bg-orange-500/10 text-orange-600 border border-orange-500/20'
                                : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                            )}>
                              {m.location.speed > 40 ? '🚗' : <Gauge className="w-3 h-3" />}
                              {Math.round(m.location.speed)} km/h
                            </div>
                          )}
                          {battery && (
                            <div className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 border', battery.bg.replace('/10', '/5'), battery.color, 'border-current/10')}>
                              <battery.Icon className={cn('w-3 h-3', battery.pulse && 'animate-pulse')} />
                              {m.location!.battery_level}%
                            </div>
                          )}
                        </div>
                      </div>

                      <ChevronRightIcon className="w-5 h-5 text-muted-foreground/20 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all shrink-0" />
                    </button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Footer Actions */}
        <div className="p-5 pt-3 border-t mt-auto space-y-2 bg-black/5 dark:bg-white/5">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="justify-start text-[12px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-white/20 dark:hover:bg-black/20 h-10 rounded-xl px-4"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 mr-2.5" /> : <Moon className="w-4 h-4 mr-2.5" />}
              {theme === 'dark' ? text.lightMode : text.darkMode}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenProfile}
              className="justify-start text-[12px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-white/20 dark:hover:bg-black/20 h-10 rounded-xl px-4"
            >
              <Settings className="w-4 h-4 mr-2.5" /> {text.settings}
            </Button>
          </div>
          
          {onOpenFamilyAdmin && isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenFamilyAdmin}
              className="w-full justify-start text-[12px] font-bold uppercase tracking-wider text-primary hover:bg-primary/10 h-10 rounded-xl px-4"
            >
              <ShieldCheck className="w-4.5 h-4.5 mr-2.5" /> {language === 'vi' ? 'Quản lý gia đình' : 'Family Admin'}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onSignOut}
            className="w-full justify-start text-[12px] font-bold uppercase tracking-wider text-destructive/80 hover:text-destructive hover:bg-destructive/10 h-10 rounded-xl px-4"
          >
            <LogOut className="w-4.5 h-4.5 mr-2.5" /> {text.signOut}
          </Button>
          
          <p className="text-[10px] text-center font-bold text-muted-foreground/40 uppercase tracking-[0.2em] pt-2">
            Family Tracker v2.0
          </p>
        </div>
      </div>

      {/* Remove member confirmation (shared state) */}
      <AlertDialog open={!!removingMember} onOpenChange={(open) => !open && setRemovingMember(null)}>
        <AlertDialogContent className="glass glass-dark border-white/10 rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bold text-xl uppercase tracking-tight">{text.removeMemberTitle}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium">
              {text.removeMemberConfirm} <strong className="text-foreground">{removingMember?.profile.display_name}</strong> {text.fromFamily}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl font-bold uppercase text-xs tracking-widest border-none bg-muted hover:bg-muted/80">{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="rounded-xl font-bold uppercase text-xs tracking-widest bg-destructive text-white hover:bg-destructive/90"
            >
              {text.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
