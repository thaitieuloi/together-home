import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { X, Send, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

interface Message {
  id: string;
  family_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface Props {
  familyId: string;
  members: FamilyMemberWithProfile[];
  onClose: () => void;
}

const COLORS = ['bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-purple-500', 'bg-pink-500', 'bg-teal-500'];

export default function FamilyChat({ familyId, members, onClose }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const getProfile = (userId: string) => members.find((m) => m.user_id === userId);
  const getMemberIndex = (userId: string) => members.findIndex((m) => m.user_id === userId);

  const getInitials = (name: string) =>
    name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  // Load messages
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('family_id', familyId)
        .order('created_at', { ascending: true })
        .limit(200);
      setMessages(data ?? []);
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 100);
    };
    load();
  }, [familyId]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('family-chat')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `family_id=eq.${familyId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [familyId]);

  const handleSend = async () => {
    if (!user || !newMessage.trim() || sending) return;
    const content = newMessage.trim();
    if (content.length > 2000) return;

    setSending(true);
    setNewMessage('');

    const { error } = await supabase.from('messages').insert({
      family_id: familyId,
      user_id: user.id,
      content,
    });

    if (error) {
      setNewMessage(content);
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="absolute bottom-20 left-4 md:left-auto md:right-20 z-[1000] w-80 h-[28rem] bg-card border border-border rounded-xl shadow-xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between bg-primary/5">
        <span className="font-semibold text-sm text-foreground">💬 Chat gia đình</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện!
          </p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const isMe = msg.user_id === user?.id;
              const profile = getProfile(msg.user_id);
              const idx = getMemberIndex(msg.user_id);

              return (
                <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                  {!isMe && (
                    <Avatar className="w-7 h-7 shrink-0">
                      <AvatarFallback className={`text-[10px] text-white ${COLORS[idx % COLORS.length]}`}>
                        {profile ? getInitials(profile.profile.display_name) : '?'}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                    {!isMe && (
                      <p className="text-[10px] text-muted-foreground mb-0.5 px-1">
                        {profile?.profile.display_name || 'Ẩn danh'}
                      </p>
                    )}
                    <div
                      className={`px-3 py-1.5 rounded-2xl text-sm break-words ${
                        isMe
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted text-foreground rounded-bl-md'
                      }`}
                    >
                      {msg.content}
                    </div>
                    <p className={`text-[10px] text-muted-foreground mt-0.5 px-1 ${isMe ? 'text-right' : ''}`}>
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: vi })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-2 border-t border-border flex gap-2">
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhập tin nhắn..."
          className="h-9 text-sm"
          maxLength={2000}
        />
        <Button
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={handleSend}
          disabled={!newMessage.trim() || sending}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
