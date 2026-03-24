import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { X, Send, Loader2, Image, MapPin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

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
  isHistoryOpen?: boolean;
}

const CHAT_TEXT = {
  vi: {
    title: '💬 Chat gia đình',
    empty: 'Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện!',
    placeholder: 'Nhập tin nhắn...',
    loadMore: 'Tải thêm',
    typing: 'đang nhập...',
    location: 'Vị trí',
    imgTooBig: 'Ảnh quá lớn',
    imgLimit: 'Tối đa 5MB',
    imgError: 'Lỗi tải ảnh',
    noLocation: 'Không thể lấy vị trí',
    shareLocation: '📍 Chia sẻ vị trí',
  },
  en: {
    title: '💬 Family Chat',
    empty: 'No messages yet. Start the conversation!',
    placeholder: 'Type a message...',
    loadMore: 'Load older',
    typing: 'is typing...',
    location: 'Location',
    imgTooBig: 'Image too large',
    imgLimit: 'Max 5MB',
    imgError: 'Upload failed',
    noLocation: 'Could not get location',
    shareLocation: '📍 Share location',
  },
};

const PAGE_SIZE = 40;
const COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-orange-500', 'bg-violet-500', 'bg-pink-500', 'bg-teal-500'];

export default function FamilyChat({ familyId, members, onClose, onUnreadChange, isHistoryOpen }: Props) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = CHAT_TEXT[language];
  const dateLocale = language === 'vi' ? vi : enUS;
  const { toast } = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oldestIdRef = useRef<string | null>(null);

  const getProfile = (userId: string) => members.find((m) => m.user_id === userId);
  const getMemberIndex = (userId: string) => members.findIndex((m) => m.user_id === userId);
  const getInitials = (name: string) =>
    name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  const loadPage = useCallback(async (beforeId?: string) => {
    let query = supabase
      .from('messages')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (beforeId) {
      const { data: ref } = await supabase
        .from('messages')
        .select('created_at')
        .eq('id', beforeId)
        .single();
      if (ref) query = query.lt('created_at', ref.created_at);
    }

    const { data } = await query;
    return ((data as Message[]) ?? []).reverse();
  }, [familyId]);

  useEffect(() => {
    const load = async () => {
      const page = await loadPage();
      setMessages(page);
      setHasMore(page.length === PAGE_SIZE);
      if (page.length > 0) oldestIdRef.current = page[0].id;
      setLoading(false);
      onUnreadChange?.(0);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 100);
    };
    load();
  }, [familyId, loadPage]);

  useEffect(() => {
    const channel = supabase
      .channel('family-chat-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `family_id=eq.${familyId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          if (prev.length > 0 && msg.id < prev[0].id) return prev;
          return [...prev, msg];
        });
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [familyId]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel(`typing:${familyId}`, {
      config: { presence: { key: user.id } },
    });

    typingChannelRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ typing: boolean; name: string }>();
      const typingNow = Object.entries(state)
        .filter(([uid, arr]) => uid !== user.id && arr.some((p) => p.typing))
        .map(([uid]) => {
          const member = getProfile(uid);
          return member?.profile.display_name ?? 'Someone';
        });
      setTypingUsers(typingNow);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ typing: false, name: user.email ?? '' });
      }
    });

    return () => { supabase.removeChannel(channel); };
  }, [familyId, user]);

  const handleTyping = () => {
    if (!typingChannelRef.current || !user) return;
    typingChannelRef.current.track({ typing: true, name: user.email ?? '' });

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      typingChannelRef.current?.track({ typing: false, name: user.email ?? '' });
    }, 2000);
  };

  const loadOlderMessages = async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);

    const oldestId = messages[0].id;
    const scrollEl = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    const prevScrollHeight = scrollEl?.scrollHeight ?? 0;

    const older = await loadPage(oldestId);
    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const fresh = older.filter((m) => !existingIds.has(m.id));
      return [...fresh, ...prev];
    });
    setHasMore(older.length === PAGE_SIZE);
    if (older.length > 0) oldestIdRef.current = older[0].id;

    setTimeout(() => {
      if (scrollEl) {
        scrollEl.scrollTop = scrollEl.scrollHeight - prevScrollHeight;
      }
    }, 50);

    setLoadingOlder(false);
  };

  const handleSend = async () => {
    if (!user || !newMessage.trim() || sending) return;
    const content = newMessage.trim();
    if (content.length > 2000) return;

    setSending(true);
    setNewMessage('');
    typingChannelRef.current?.track({ typing: false, name: user.email ?? '' });

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
      toast({ title: t.imgTooBig, description: t.imgLimit, variant: 'destructive' });
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${familyId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-images')
      .upload(path, file);

    if (uploadError) {
      toast({ title: t.imgError, description: uploadError.message, variant: 'destructive' });
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
        content: t.shareLocation,
        location_lat: pos.coords.latitude,
        location_lng: pos.coords.longitude,
      });
    } catch {
      toast({ title: t.noLocation, variant: 'destructive' });
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
        <button
          className="flex items-center gap-1.5 underline text-left hover:opacity-80 transition-opacity"
          onClick={() =>
            window.open(
              `https://www.google.com/maps?q=${msg.location_lat},${msg.location_lng}`,
              '_blank'
            )
          }
        >
          <MapPin className="w-3 h-3 shrink-0" />
          <span>{msg.content || t.location}</span>
          <span className="text-[10px] opacity-70">
            ({msg.location_lat.toFixed(4)}, {msg.location_lng.toFixed(4)})
          </span>
        </button>
      );
    }
    return msg.content;
  };

  return (
    <div className={cn(
      "absolute bottom-20 left-2 right-2 md:left-auto z-[1000] md:w-80 h-[70vh] md:h-[28rem] glass glass-dark rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-500 ease-in-out",
      isHistoryOpen ? "md:right-[444px]" : "md:right-20"
    )}>
      <div className="p-3 border-b border-border/50 flex items-center justify-between">
        <span className="font-semibold text-sm text-foreground">{t.title}</span>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-3" ref={scrollAreaRef}>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {hasMore && (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground h-7"
                  onClick={loadOlderMessages}
                  disabled={loadingOlder}
                >
                  {loadingOlder ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  {t.loadMore}
                </Button>
              </div>
            )}

            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">{t.empty}</p>
            ) : (
              messages.map((msg) => {
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
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: dateLocale })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}

            {typingUsers.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <div className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {typingUsers.join(', ')} {t.typing}
                </p>
              </div>
            )}

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
          onChange={(e) => {
            setNewMessage(e.target.value);
            handleTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder={t.placeholder}
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
