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
  BatteryCharging,
  Gauge,
  WifiOff,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
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

const SIDEBAR_TEXT = {
  vi: {
    online: 'Online',
    recent: 'Gần đây',
    offline: 'Offline',
    copied: 'Đã sao chép mã mời!',
    removeError: 'Không thể xóa thành viên',
    removed: 'Đã xóa',
    members: 'Thành viên',
    noLocation: 'Chưa có vị trí',
    viewTrip: 'Xem lịch sử di chuyển',
    removeMember: 'Xóa thành viên',
    lightMode: 'Chế độ sáng',
    darkMode: 'Chế độ tối',
    settings: 'Cài đặt',
    signOut: 'Đăng xuất',
    removeMemberTitle: 'Xóa thành viên',
    removeMemberConfirm: 'Bạn có chắc muốn xóa',
    fromFamily: 'khỏi nhóm gia đình?',
    cancel: 'Hủy',
    remove: 'Xóa',
  },
  en: {
    online: 'Online',
    recent: 'Recently active',
    offline: 'Offline',
    copied: 'Invite code copied!',
    removeError: 'Unable to remove member',
    removed: 'Removed',
    members: 'Members',
    noLocation: 'No location yet',
    viewTrip: 'View movement history',
    removeMember: 'Remove member',
    lightMode: 'Light mode',
    darkMode: 'Dark mode',
    settings: 'Settings',
    signOut: 'Sign out',
    removeMemberTitle: 'Remove member',
    removeMemberConfirm: 'Are you sure you want to remove',
    fromFamily: 'from this family?',
    cancel: 'Cancel',
    remove: 'Remove',
  },
};

function getFreshnessInfo(timestamp: string, language: 'vi' | 'en') {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMin = diffMs / 60000;
  const text = SIDEBAR_TEXT[language];

  if (diffMin < 5) {
    return {
      color: 'bg-emerald-500',
      label: text.online,
      ring: 'ring-emerald-500/30',
      textClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      isOffline: false,
    };
  }

  if (diffMin < 30) {
    return {
      color: 'bg-amber-500',
      label: text.recent,
      ring: 'ring-amber-500/30',
      textClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      isOffline: false,
    };
  }

  return {
    color: 'bg-red-500',
    label: text.offline,
    ring: 'ring-red-500/30',
    textClass: 'bg-red-500/10 text-red-600 dark:text-red-400',
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
}: Props) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const text = SIDEBAR_TEXT[language];
  const dateLocale = language === 'vi' ? vi : enUS;
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [removingMember, setRemovingMember] = useState<FamilyMemberWithProfile | null>(null);

  const isAdmin = members.find((m) => m.user_id === user?.id)?.role === 'admin';

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

  if (collapsed) {
    return (
      <div className="w-14 bg-card border-r border-border/50 flex flex-col items-center py-4 gap-3">
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} className="rounded-full">
          <ChevronRight className="w-4 h-4" />
        </Button>
        {members.map((m, i) => {
          const freshness = m.location ? getFreshnessInfo(m.location.timestamp, language) : null;
          const isUpdated = recentlyUpdated.has(m.user_id);
          return (
            <button key={m.user_id} onClick={() => onMemberClick(m)} className="relative group">
              <Avatar
                className={cn(
                  'w-8 h-8 transition-transform duration-200 group-hover:scale-110',
                  isUpdated && 'animate-bounce-subtle',
                  freshness?.isOffline && 'opacity-60'
                )}
              >
                {m.profile.avatar_url ? <AvatarImage src={m.profile.avatar_url} alt={m.profile.display_name} /> : null}
                <AvatarFallback className={cn('text-xs text-white', colors[i % colors.length])}>
                  {getInitials(m.profile.display_name)}
                </AvatarFallback>
              </Avatar>
              {freshness && (
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card',
                    freshness.color
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className="w-72 bg-card border-r border-border/50 flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <h2 className="font-semibold text-foreground">{family.name}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCollapsed(true)} className="h-7 w-7 rounded-full">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs rounded-full px-3">
              {family.invite_code}
            </Badge>
            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={copyInviteCode}>
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Members */}
        <div className="flex-1 overflow-auto p-2">
          <p className="text-xs font-medium text-muted-foreground px-2 py-1.5 uppercase tracking-wider">
            {text.members} ({members.length})
          </p>
          {members.map((m, i) => {
            const freshness = m.location ? getFreshnessInfo(m.location.timestamp, language) : null;
            const isUpdated = recentlyUpdated.has(m.user_id);
            const canRemove = isAdmin && m.user_id !== user?.id;
            return (
              <div key={m.user_id} className="group relative">
                <button
                  onClick={() => onMemberClick(m)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent/80 transition-all duration-200 text-left"
                >
                  <div className="relative">
                    <Avatar
                      className={cn(
                        'w-10 h-10 transition-transform duration-200 group-hover:scale-105',
                        freshness ? `ring-2 ${freshness.ring}` : '',
                        isUpdated && 'animate-bounce-subtle ring-2 ring-primary/50',
                        freshness?.isOffline && 'opacity-60'
                      )}
                    >
                      {m.profile.avatar_url ? <AvatarImage src={m.profile.avatar_url} alt={m.profile.display_name} /> : null}
                      <AvatarFallback className={cn('text-sm font-medium text-white', colors[i % colors.length])}>
                        {getInitials(m.profile.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    {freshness && (
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card transition-colors',
                          freshness.color
                        )}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{m.profile.display_name}</p>
                      {liveSharingUserIds.has(m.user_id) && (
                        <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-primary/10 text-primary">
                          <Radio className="w-2.5 h-2.5 animate-pulse" />
                          Live
                        </span>
                      )}
                      {freshness && !liveSharingUserIds.has(m.user_id) && (
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5', freshness.textClass)}>
                          {freshness.isOffline && <WifiOff className="w-2.5 h-2.5" />}
                          {freshness.label}
                        </span>
                      )}
                    </div>
                    {m.location ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(m.location.timestamp), { addSuffix: true, locale: dateLocale })}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{text.noLocation}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {m.location?.is_moving && m.location?.speed && m.location.speed > 3 && (
                        <span className={cn(
                          'flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                          m.location.speed > 40
                            ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                            : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        )}>
                          {m.location.speed > 40 ? '🚗' : <Gauge className="w-2.5 h-2.5" />}
                          {Math.round(m.location.speed)} km/h
                        </span>
                      )}
                      {(() => {
                        const bat = getBatteryInfo(m.location?.battery_level ?? null);
                        if (!bat || m.location?.battery_level === null || m.location?.battery_level === undefined) return null;
                        return (
                          <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${bat.bg} ${bat.color}`}>
                            <bat.Icon className={`w-2.5 h-2.5 ${bat.pulse ? 'animate-pulse' : ''}`} />
                            {m.location!.battery_level}%
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <MapPin className="w-4 h-4 text-muted-foreground/50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
                {/* Action buttons on hover */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {m.location && onShowTrip && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowTrip(m);
                      }}
                      title={text.viewTrip}
                    >
                      <Route className="w-3.5 h-3.5 text-primary" />
                    </Button>
                  )}
                  {canRemove && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRemovingMember(m);
                      }}
                      title={text.removeMember}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border/50 space-y-0.5">
          <Button
            variant="ghost"
            onClick={toggleTheme}
            className="w-full justify-start text-muted-foreground rounded-xl"
            size="sm"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
            {theme === 'dark' ? text.lightMode : text.darkMode}
          </Button>
          {onOpenFamilyAdmin && isAdmin && (
            <Button
              variant="ghost"
              onClick={onOpenFamilyAdmin}
              className="w-full justify-start text-primary hover:text-primary hover:bg-primary/10 rounded-xl"
              size="sm"
            >
              <ShieldCheck className="w-4 h-4 mr-2" /> {language === 'vi' ? 'Quản lý gia đình' : 'Family Admin'}
            </Button>
          )}
          {onOpenProfile && (
            <Button
              variant="ghost"
              onClick={onOpenProfile}
              className="w-full justify-start text-muted-foreground rounded-xl"
              size="sm"
            >
              <Settings className="w-4 h-4 mr-2" /> {text.settings}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={onSignOut}
            className="w-full justify-start text-muted-foreground hover:text-destructive rounded-xl"
            size="sm"
          >
            <LogOut className="w-4 h-4 mr-2" /> {text.signOut}
          </Button>
        </div>
      </div>

      {/* Remove member confirmation */}
      <AlertDialog open={!!removingMember} onOpenChange={(open) => !open && setRemovingMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{text.removeMemberTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {text.removeMemberConfirm} <strong>{removingMember?.profile.display_name}</strong> {text.fromFamily}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {text.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
