import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Copy, LogOut, Users, ChevronLeft, ChevronRight, Settings, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

function getFreshnessInfo(timestamp: string) {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMin = diffMs / 60000;
  if (diffMin < 5) return { color: 'bg-emerald-500', label: 'Online', ring: 'ring-emerald-500/30', textClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
  if (diffMin < 30) return { color: 'bg-amber-500', label: 'Gần đây', ring: 'ring-amber-500/30', textClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' };
  return { color: 'bg-red-500', label: 'Offline', ring: 'ring-red-500/30', textClass: 'bg-red-500/10 text-red-600 dark:text-red-400' };
}

interface Props {
  family: Tables<'families'>;
  members: FamilyMemberWithProfile[];
  onMemberClick: (member: FamilyMemberWithProfile) => void;
  onSignOut: () => void;
  onOpenProfile?: () => void;
  recentlyUpdated?: Set<string>;
}

export default function FamilySidebar({ family, members, onMemberClick, onSignOut, onOpenProfile, recentlyUpdated = new Set() }: Props) {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const copyInviteCode = () => {
    navigator.clipboard.writeText(family.invite_code);
    toast({ title: 'Đã sao chép mã mời!' });
  };

  const getInitials = (name: string) =>
    name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-orange-500', 'bg-violet-500', 'bg-pink-500', 'bg-teal-500'];

  if (collapsed) {
    return (
      <div className="w-14 bg-card border-r border-border/50 flex flex-col items-center py-4 gap-3">
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} className="rounded-full">
          <ChevronRight className="w-4 h-4" />
        </Button>
        {members.map((m, i) => {
          const freshness = m.location ? getFreshnessInfo(m.location.timestamp) : null;
          return (
            <button key={m.user_id} onClick={() => onMemberClick(m)} className="relative group">
              <Avatar className="w-8 h-8 transition-transform duration-200 group-hover:scale-110">
                <AvatarFallback className={cn('text-xs text-white', colors[i % colors.length])}>
                  {getInitials(m.profile.display_name)}
                </AvatarFallback>
              </Avatar>
              {freshness && (
                <span className={cn('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card', freshness.color)} />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
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
          Thành viên ({members.length})
        </p>
        {members.map((m, i) => {
          const freshness = m.location ? getFreshnessInfo(m.location.timestamp) : null;
          return (
            <button
              key={m.user_id}
              onClick={() => onMemberClick(m)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent/80 transition-all duration-200 text-left group"
            >
              <div className="relative">
                <Avatar className={cn('w-10 h-10 transition-transform duration-200 group-hover:scale-105', freshness ? `ring-2 ${freshness.ring}` : '')}>
                  <AvatarFallback className={cn('text-sm font-medium text-white', colors[i % colors.length])}>
                    {getInitials(m.profile.display_name)}
                  </AvatarFallback>
                </Avatar>
                {freshness && (
                  <span className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card transition-colors', freshness.color)} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{m.profile.display_name}</p>
                  {freshness && (
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', freshness.textClass)}>
                      {freshness.label}
                    </span>
                  )}
                </div>
                {m.location ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(m.location.timestamp), { addSuffix: true, locale: vi })}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Chưa có vị trí</p>
                )}
              </div>
              <MapPin className="w-4 h-4 text-muted-foreground/50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border/50 space-y-0.5">
        <Button variant="ghost" onClick={toggleTheme} className="w-full justify-start text-muted-foreground rounded-xl" size="sm">
          {theme === 'dark' ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
          {theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
        </Button>
        {onOpenProfile && (
          <Button variant="ghost" onClick={onOpenProfile} className="w-full justify-start text-muted-foreground rounded-xl" size="sm">
            <Settings className="w-4 h-4 mr-2" /> Cài đặt
          </Button>
        )}
        <Button variant="ghost" onClick={onSignOut} className="w-full justify-start text-muted-foreground hover:text-destructive rounded-xl" size="sm">
          <LogOut className="w-4 h-4 mr-2" /> Đăng xuất
        </Button>
      </div>
    </div>
  );
}
