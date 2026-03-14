import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, X, Loader2, List, Map } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { vi as viLocale, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Props {
  members: FamilyMemberWithProfile[];
  onHistoryLoaded: (trail: Tables<'user_locations'>[], mode: 'map' | 'list') => void;
  onClose: () => void;
}

const TIME_RANGES = {
  vi: [
    { label: '1 giờ', value: '1h', hours: 1 },
    { label: '3 giờ', value: '3h', hours: 3 },
    { label: '6 giờ', value: '6h', hours: 6 },
    { label: '12 giờ', value: '12h', hours: 12 },
    { label: '24 giờ', value: '24h', hours: 24 },
    { label: '3 ngày', value: '3d', hours: 72 },
    { label: '7 ngày', value: '7d', hours: 168 },
  ],
  en: [
    { label: '1 hour', value: '1h', hours: 1 },
    { label: '3 hours', value: '3h', hours: 3 },
    { label: '6 hours', value: '6h', hours: 6 },
    { label: '12 hours', value: '12h', hours: 12 },
    { label: '24 hours', value: '24h', hours: 24 },
    { label: '3 days', value: '3d', hours: 72 },
    { label: '7 days', value: '7d', hours: 168 },
  ],
};

const TEXT = {
  vi: {
    pickMember: 'Chọn thành viên',
    view: 'Xem',
    noData: 'Không có dữ liệu',
    noDataDesc: 'Chưa có lịch sử di chuyển trong khoảng thời gian này',
    stops: 'điểm dừng',
    mapView: 'Bản đồ',
    listView: 'Danh sách',
    walking: '🚶 Đi bộ',
    driving: '🚗 Lái xe',
    stationary: '📍 Dừng',
  },
  en: {
    pickMember: 'Select member',
    view: 'View',
    noData: 'No data',
    noDataDesc: 'No location history in this time range',
    stops: 'stops',
    mapView: 'Map',
    listView: 'List',
    walking: '🚶 Walking',
    driving: '🚗 Driving',
    stationary: '📍 Stop',
  },
};

function getTravelMode(speedMs: number | null, t: typeof TEXT['vi']) {
  if (!speedMs || speedMs < 0.5) return t.stationary;
  const kmh = speedMs * 3.6;
  if (kmh > 40) return t.driving;
  return t.walking;
}

function getSpeedColor(speedMs: number | null): string {
  if (!speedMs || speedMs < 0.5) return '#6b7280';
  const kmh = speedMs * 3.6;
  if (kmh > 40) return '#ef4444';
  if (kmh > 15) return '#f97316';
  if (kmh > 5) return '#eab308';
  return '#3b82f6';
}

export default function LocationHistory({ members, onHistoryLoaded, onClose }: Props) {
  const { language } = useLanguage();
  const t = TEXT[language];
  const ranges = TIME_RANGES[language];
  const dateLocale = language === 'vi' ? viLocale : enUS;

  const [selectedMember, setSelectedMember] = useState('');
  const [selectedRange, setSelectedRange] = useState('3h');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [trail, setTrail] = useState<Tables<'user_locations'>[]>([]);
  const [showList, setShowList] = useState(false);

  const loadHistory = async () => {
    if (!selectedMember) return;
    setLoading(true);

    const range = ranges.find((r) => r.value === selectedRange);
    const since = new Date(Date.now() - (range?.hours ?? 3) * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from('user_locations')
      .select('*')
      .eq('user_id', selectedMember)
      .gte('timestamp', since)
      .order('timestamp', { ascending: false })
      .limit(500);

    const result = data ?? [];
    setTrail(result);
    onHistoryLoaded(result, viewMode);
    setLoading(false);

    if (viewMode === 'list') {
      setShowList(true);
    }
  };

  const handleViewModeChange = (mode: 'map' | 'list') => {
    setViewMode(mode);
    if (trail.length > 0) {
      onHistoryLoaded(trail, mode);
      if (mode === 'list') setShowList(true);
      else setShowList(false);
    }
  };

  return (
    <>
      {/* Control bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-card border border-border rounded-xl shadow-xl p-3 flex flex-wrap items-center gap-2 max-w-[95vw]">
        <History className="w-4 h-4 text-primary shrink-0" />

        <Select value={selectedMember} onValueChange={setSelectedMember}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder={t.pickMember} />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {m.profile.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedRange} onValueChange={setSelectedRange}>
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ranges.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* View mode toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => handleViewModeChange('map')}
            className={cn(
              'px-2 py-1 text-xs flex items-center gap-1 transition-colors',
              viewMode === 'map' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent'
            )}
          >
            <Map className="w-3 h-3" /> {t.mapView}
          </button>
          <button
            onClick={() => handleViewModeChange('list')}
            className={cn(
              'px-2 py-1 text-xs flex items-center gap-1 transition-colors',
              viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent'
            )}
          >
            <List className="w-3 h-3" /> {t.listView}
          </button>
        </div>

        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={loadHistory}
          disabled={!selectedMember || loading}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : t.view}
        </Button>

        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* List view panel */}
      {showList && trail.length > 0 && (
        <div className="absolute bottom-20 left-4 right-4 z-[999] bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-64">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-foreground">
              {trail.length} {t.stops}
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowList(false)}>
              <X className="w-3 h-3" />
            </Button>
          </div>
          <ScrollArea className="h-48">
            <div className="divide-y divide-border">
              {trail.map((loc, i) => {
                const speedColor = getSpeedColor(loc.speed);
                const travelLabel = getTravelMode(loc.speed, t);
                return (
                  <div key={loc.id ?? i} className="flex items-start gap-2 p-2">
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                      style={{ backgroundColor: speedColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-foreground font-medium">
                          {format(new Date(loc.timestamp), 'HH:mm', { locale: dateLocale })}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{travelLabel}</span>
                        {loc.speed && loc.speed > 0.5 && (
                          <span className="text-[10px] font-medium" style={{ color: speedColor }}>
                            {Math.round(loc.speed * 3.6)} km/h
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {format(new Date(loc.timestamp), 'dd/MM', { locale: dateLocale })}
                    </span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* No data state */}
      {!loading && trail.length === 0 && showList && (
        <div className="absolute bottom-20 left-4 right-4 z-[999] bg-card border border-border rounded-xl shadow-xl p-4 text-center">
          <p className="text-sm font-medium text-foreground">{t.noData}</p>
          <p className="text-xs text-muted-foreground mt-1">{t.noDataDesc}</p>
        </div>
      )}
    </>
  );
}
