import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Copy, LogOut, Users, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  family: Tables<'families'>;
  members: FamilyMemberWithProfile[];
  onMemberClick: (member: FamilyMemberWithProfile) => void;
  onSignOut: () => void;
}

export default function FamilySidebar({ family, members, onMemberClick, onSignOut }: Props) {
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(false);

  const copyInviteCode = () => {
    navigator.clipboard.writeText(family.invite_code);
    toast({ title: 'Đã sao chép mã mời!' });
  };

  const getInitials = (name: string) =>
    name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  const colors = ['bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-purple-500', 'bg-pink-500', 'bg-teal-500'];

  if (collapsed) {
    return (
      <div className="w-14 bg-card border-r border-border flex flex-col items-center py-4 gap-3">
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        {members.map((m, i) => (
          <button key={m.user_id} onClick={() => onMemberClick(m)} className="relative">
            <Avatar className="w-8 h-8">
              <AvatarFallback className={cn('text-xs text-white', colors[i % colors.length])}>
                {getInitials(m.profile.display_name)}
              </AvatarFallback>
            </Avatar>
            {m.location && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-card" />
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="w-72 bg-card border-r border-border flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">{family.name}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(true)} className="h-7 w-7">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            {family.invite_code}
          </Badge>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyInviteCode}>
            <Copy className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Members */}
      <div className="flex-1 overflow-auto p-2">
        <p className="text-xs font-medium text-muted-foreground px-2 py-1 uppercase tracking-wider">
          Thành viên ({members.length})
        </p>
        {members.map((m, i) => (
          <button
            key={m.user_id}
            onClick={() => onMemberClick(m)}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left"
          >
            <div className="relative">
              <Avatar className="w-10 h-10">
                <AvatarFallback className={cn('text-sm font-medium text-white', colors[i % colors.length])}>
                  {getInitials(m.profile.display_name)}
                </AvatarFallback>
              </Avatar>
              {m.location && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-card" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{m.profile.display_name}</p>
              {m.location ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(m.location.timestamp), { addSuffix: true, locale: vi })}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Chưa có vị trí</p>
              )}
            </div>
            {m.location && <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />}
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border">
        <Button variant="ghost" onClick={onSignOut} className="w-full justify-start text-muted-foreground" size="sm">
          <LogOut className="w-4 h-4 mr-2" /> Đăng xuất
        </Button>
      </div>
    </div>
  );
}
