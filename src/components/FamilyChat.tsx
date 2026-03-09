import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { X, Send, Loader2, Image, MapPin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  family_id: string;
  user_id: string;
  content: string | null;
  image_url: string | null;
  location_lat: number | null;
  location_lng: number | null;
  created_at: string;
}

interface Props {
  familyId: string;
  members: FamilyMemberWithProfile[];
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
}

const COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-orange-500', 'bg-violet-500', 'bg-pink-500', 'bg-teal-500'];

export default function FamilyChat({ familyId, members, onClose, onUnreadChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getProfile = (userId: string) => members.find((m) => m.user_id === userId);
  const getMemberIndex = (userId: string) => members.findIndex((m) => m.user_id === userId);
  const getInitials = (name: string) =>
    name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('family_id', familyId)
        .order('created_at', { ascending: true })
        .limit(200);
      setMessages((data as Message[]) ?? []);
      setLoading(false);
      onUnreadChange?.(0);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 100);
    };
    load();
  }, [familyId]);

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

    if (error) setNewMessage(content);
    setSending(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Ảnh quá lớn', description: 'Tối đa 5MB', variant: 'destructive' });
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${familyId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-images')
      .upload(path, file);

    if (uploadError) {
      toast({ title: 'Lỗi tải ảnh', description: uploadError.message, variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(path);

    await supabase.from('messages').insert({
      family_id: familyId,
      user_id: user.id,
      image_url: urlData.publicUrl,
    });

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleShareLocation = async () => {
    if (!user) return;
    setSending(true);

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      await supabase.from('messages').insert({
        family_id: familyId,
        user_id: user.id,
        content: '📍 Chia sẻ vị trí',
        location_lat: pos.coords.latitude,
        location_lng: pos.coords.longitude,
      });
    } catch {
      toast({ title: 'Không thể lấy vị trí', variant: 'destructive' });
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMessageContent = (msg: Message) => {
    if (msg.image_url) {
      return (
        <img
          src={msg.image_url}
          alt="Chat image"
          className="max-w-full rounded-xl max-h-48 object-cover cursor-pointer"
          onClick={() => window.open(msg.image_url!, '_blank')}
        />
      );
    }
    if (msg.location_lat && msg.location_lng) {
      return (
        <a
          href={`https://www.google.com/maps?q=${msg.location_lat},${msg.location_lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 underline"
        >
          <MapPin className="w-3 h-3" />
          {msg.content || 'Vị trí'}
          <span className="text-[10px] opacity-70">
            ({msg.location_lat.toFixed(4)}, {msg.location_lng.toFixed(4)})
          </span>
        </a>
      );
    }
    return msg.content;
  };

  return (
    <div className="absolute bottom-20 left-2 right-2 md:left-auto md:right-20 z-[1000] md:w-80 h-[70vh] md:h-[28rem] glass glass-dark rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
      <div className="p-3 border-b border-border/50 flex items-center justify-between">
        <span className="font-semibold text-sm text-foreground">💬 Chat gia đình</span>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

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
                <div key={msg.id} className={cn('flex gap-2', isMe ? 'flex-row-reverse' : '')}>
                  {!isMe && (
                    <Avatar className="w-7 h-7 shrink-0">
                      <AvatarFallback className={cn('text-[10px] text-white', COLORS[idx % COLORS.length])}>
                        {profile ? getInitials(profile.profile.display_name) : '?'}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className={cn('max-w-[75%]', isMe ? 'items-end' : 'items-start')}>
                    {!isMe && (
                      <p className="text-[10px] text-muted-foreground mb-0.5 px-1">
                        {profile?.profile.display_name || 'Ẩn danh'}
                      </p>
                    )}
                    <div
                      className={cn(
                        'px-3 py-2 rounded-2xl text-sm break-words transition-colors',
                        isMe
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted text-foreground rounded-bl-md'
                      )}
                    >
                      {renderMessageContent(msg)}
                    </div>
                    <p className={cn('text-[10px] text-muted-foreground/60 mt-0.5 px-1', isMe ? 'text-right' : '')}>
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

      <div className="p-2 border-t border-border/50 flex gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0 rounded-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0 rounded-full"
          onClick={handleShareLocation}
          disabled={sending}
        >
          <MapPin className="w-4 h-4" />
        </Button>
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhập tin nhắn..."
          className="h-9 text-sm rounded-full"
          maxLength={2000}
        />
        <Button
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full"
          onClick={handleSend}
          disabled={!newMessage.trim() || sending}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
