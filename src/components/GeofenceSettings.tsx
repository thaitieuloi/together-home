import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFamily } from '@/hooks/useFamily';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Bell, MapPin, LogIn, LogOut, Clock, Loader2, Shield } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const GEOFENCE_SETTINGS_TEXT = {
  vi: {
    title: 'Cài đặt vùng an toàn',
    prefsTab: 'Thông báo',
    historyTab: 'Lịch sử sự kiện',
    noGeofences: 'Chưa có vùng an toàn nào',
    noGeofencesDesc: 'Tạo vùng an toàn trong màn hình Vùng để bắt đầu nhận thông báo',
    notifyEnter: 'Khi vào vùng',
    notifyExit: 'Khi rời vùng',
    noEvents: 'Chưa có sự kiện',
    entered: 'đã đến',
    left: 'đã rời',
    unknown: 'Không xác định',
  },
  en: {
    title: 'Zone Settings',
    prefsTab: 'Notifications',
    historyTab: 'Event History',
    noGeofences: 'No zones yet',
    noGeofencesDesc: 'Create zones in the Zones screen to start receiving notifications',
    notifyEnter: 'Notify on enter',
    notifyExit: 'Notify on exit',
    noEvents: 'No events yet',
    entered: 'entered',
    left: 'left',
    unknown: 'Unknown',
  },
};


interface GeofencePref {
  geofence_id: string;
  notify_enter: boolean;
  notify_exit: boolean;
}

interface GeofenceEvent {
  id: string;
  user_id: string;
  geofence_id: string;
  event_type: string;
  created_at: string;
  user_name?: string;
  geofence_name?: string;
}

interface Geofence {
  id: string;
  name: string;
}

interface Props {
  onBack: () => void;
}

export default function GeofenceSettings({ onBack }: Props) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = GEOFENCE_SETTINGS_TEXT[language];
  const { family, members } = useFamily();
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [prefs, setPrefs] = useState<Map<string, GeofencePref>>(new Map());
  const [events, setEvents] = useState<GeofenceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!family || !user) return;
    setLoading(true);

    const [geoRes, prefRes, eventsRes] = await Promise.all([
      supabase.from('geofences').select('id, name').eq('family_id', family.id),
      supabase.from('geofence_notification_prefs').select('*').eq('user_id', user.id),
      supabase
        .from('geofence_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (geoRes.data) setGeofences(geoRes.data);

    if (prefRes.data) {
      const map = new Map<string, GeofencePref>();
      for (const p of prefRes.data) {
        map.set(p.geofence_id, {
          geofence_id: p.geofence_id,
          notify_enter: p.notify_enter,
          notify_exit: p.notify_exit,
        });
      }
      setPrefs(map);
    }

    if (eventsRes.data && geoRes.data) {
      // Build lookup maps
      const geoMap = new Map(geoRes.data.map((g) => [g.id, g.name]));
      const memberMap = new Map(members.map((m) => [m.user_id, m.profile.display_name]));

      const enriched = eventsRes.data
        .filter((e) => geoMap.has(e.geofence_id))
        .map((e) => ({
          ...e,
          user_name: memberMap.get(e.user_id) || t.unknown,
          geofence_name: geoMap.get(e.geofence_id) || t.unknown,
        }));
      setEvents(enriched as GeofenceEvent[]);
    }

    setLoading(false);
  }, [family, user, members]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const togglePref = async (geofenceId: string, field: 'notify_enter' | 'notify_exit') => {
    if (!user) return;
    setSavingId(`${geofenceId}-${field}`);

    const existing = prefs.get(geofenceId);
    const newValue = existing ? !existing[field] : false; // default is true, so toggling = false

    const newPref: GeofencePref = {
      geofence_id: geofenceId,
      notify_enter: existing?.notify_enter ?? true,
      notify_exit: existing?.notify_exit ?? true,
      [field]: newValue,
    };

    await supabase.from('geofence_notification_prefs').upsert(
      {
        user_id: user.id,
        geofence_id: geofenceId,
        notify_enter: newPref.notify_enter,
        notify_exit: newPref.notify_exit,
      },
      { onConflict: 'user_id,geofence_id' }
    );

    setPrefs((prev) => new Map(prev).set(geofenceId, newPref));
    setSavingId(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Thông báo vùng an toàn</h1>
        </div>

        <Tabs defaultValue="settings">
          {/* tabs */}
          <TabsList className="w-full">
            <TabsTrigger value="settings" className="flex-1">
              <Bell className="w-4 h-4 mr-1" /> Cài đặt
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              <Clock className="w-4 h-4 mr-1" /> Lịch sử
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-3 mt-3">
            {geofences.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Chưa có vùng an toàn nào. Thêm vùng an toàn từ bản đồ trước.
              </p>
            ) : (
              geofences.map((g) => {
                const pref = prefs.get(g.id);
                const enterOn = pref?.notify_enter ?? true;
                const exitOn = pref?.notify_exit ?? true;

                return (
                  <Card key={g.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-primary" />
                        {g.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                          <LogIn className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-foreground">{t.notifyEnter}</span>
                        </div>
                        <Switch
                          checked={enterOn}
                          disabled={savingId === `${g.id}-notify_enter`}
                          onCheckedChange={() => togglePref(g.id, 'notify_enter')}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                          <LogOut className="w-3.5 h-3.5 text-red-500" />
                          <span className="text-foreground">{t.notifyExit}</span>
                        </div>
                        <Switch
                          checked={exitOn}
                          disabled={savingId === `${g.id}-notify_exit`}
                          onCheckedChange={() => togglePref(g.id, 'notify_exit')}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-3">
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[60vh]">
                  {events.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Chưa có sự kiện nào
                    </p>
                  ) : (
                    <div className="divide-y divide-border">
                      {events.map((ev) => {
                        const isEnter = ev.event_type === 'enter';
                        return (
                          <div key={ev.id} className="flex items-start gap-3 p-3">
                            <div className={cn(
                              'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                              isEnter ? 'bg-green-500/10' : 'bg-red-500/10'
                            )}>
                              {isEnter ? (
                                <LogIn className="w-4 h-4 text-green-500" />
                              ) : (
                                <LogOut className="w-4 h-4 text-red-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground">
                                <span className="font-medium">{ev.user_name}</span>
                                {isEnter ? ` ${t.entered} ` : ` ${t.left} `}
                                <span className="font-medium">{ev.geofence_name}</span>
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {format(new Date(ev.created_at), 'HH:mm dd/MM/yyyy', { locale: vi })}
                                {' · '}
                                {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true, locale: vi })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
