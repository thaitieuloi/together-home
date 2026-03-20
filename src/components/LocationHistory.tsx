import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  History, X, Loader2, Navigation, MapPin, Clock, Play, Pause,
  FastForward, Calendar, Trash2, Car, Bike, Footprints, Route,
  ChevronDown,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { vi as viLocale, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getServerNow } from '@/lib/time';
import { detectTrips, TripSegment, getActivityType, getActivityLabel } from '@/lib/tripUtils';
import { batchReverseGeocode, getCacheKey } from '@/lib/geocoding';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface Props {
  members: FamilyMemberWithProfile[];
  onHistoryLoaded: (trail: Tables<'user_locations'>[], mode: 'map' | 'list') => void;
  onClose: () => void;
  onPlaybackChange?: (point: Tables<'user_locations'> | null) => void;
  initialMemberId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIME_RANGES = {
  vi: [
    { label: '3g', value: '3h', hours: 3 },
    { label: '6g', value: '6h', hours: 6 },
    { label: '12g', value: '12h', hours: 12 },
    { label: '24g', value: '24h', hours: 24 },
    { label: '3 ngày', value: '3d', hours: 72 },
    { label: '7 ngày', value: '7d', hours: 168 },
  ],
  en: [
    { label: '3h', value: '3h', hours: 3 },
    { label: '6h', value: '6h', hours: 6 },
    { label: '12h', value: '12h', hours: 12 },
    { label: '24h', value: '24h', hours: 24 },
    { label: '3d', value: '3d', hours: 72 },
    { label: '7d', value: '7d', hours: 168 },
  ],
};

const TEXT = {
  vi: {
    title: 'Lịch sử di chuyển',
    pickMember: 'Chọn thành viên',
    noData: 'Không có dữ liệu!',
    noDataDesc: 'Không tìm thấy lịch sử di chuyển trong khoảng thời gian này.',
    suggestRange: 'Hãy thử chọn mốc thời gian dài hơn.',
    trip: 'Chuyến đi',
    stay: 'Dừng chân',
    distance: 'Quãng đường',
    avgSpeed: 'Tốc độ TB',
    maxSpeed: 'Tốc độ max',
    error: 'Lỗi tải dữ liệu',
    loading: 'Đang tải hành trình...',
    loadingAddr: 'Đang lấy địa chỉ...',
    today: 'Hôm nay',
    yesterday: 'Hôm qua',
    trips: 'chuyến',
    stops: 'điểm dừng',
    totalDist: 'Tổng KM',
    movingTime: 'Di chuyển',
  },
  en: {
    title: 'Location History',
    pickMember: 'Select member',
    noData: 'No movements found!',
    noDataDesc: 'We couldn\'t find any location history in this time range.',
    suggestRange: 'Try selecting a longer time range.',
    trip: 'Trip',
    stay: 'Stay',
    distance: 'Distance',
    avgSpeed: 'Avg Speed',
    maxSpeed: 'Max Speed',
    error: 'Failed to load data',
    loading: 'Loading journey...',
    loadingAddr: 'Fetching address...',
    today: 'Today',
    yesterday: 'Yesterday',
    trips: 'trips',
    stops: 'stops',
    totalDist: 'Total KM',
    movingTime: 'Moving',
  },
};

// ─── Activity icon ────────────────────────────────────────────────────────────

function ActivityIcon({ avgSpeedMs, className }: { avgSpeedMs: number; className?: string }) {
  const type = getActivityType(avgSpeedMs);
  const iconClass = cn('w-4 h-4', className);
  if (type === 'driving')  return <Car className={iconClass} />;
  if (type === 'cycling')  return <Bike className={iconClass} />;
  if (type === 'walking')  return <Footprints className={iconClass} />;
  return <MapPin className={iconClass} />;
}

// ─── Day group helper ─────────────────────────────────────────────────────────

interface DayGroup {
  dateLabel: string;   // "Hôm nay", "20/03/2026", …
  dateKey: string;     // "2026-03-20" for sorting
  segments: TripSegment[];
  totalDistM: number;
  totalMovingMin: number;
  tripCount: number;
  stayCount: number;
}

function buildDayGroups(trips: TripSegment[], lang: 'vi' | 'en'): DayGroup[] {
  const t = TEXT[lang];
  const now = getServerNow();
  const todayKey = format(now, 'yyyy-MM-dd');
  const yesterdayKey = format(new Date(now.getTime() - 86400000), 'yyyy-MM-dd');

  const map = new Map<string, DayGroup>();

  for (const seg of trips) {
    const dateKey = format(new Date(seg.startTime), 'yyyy-MM-dd');
    if (!map.has(dateKey)) {
      let dateLabel = format(new Date(seg.startTime), 'dd/MM/yyyy');
      if (dateKey === todayKey) dateLabel = t.today;
      else if (dateKey === yesterdayKey) dateLabel = t.yesterday;

      map.set(dateKey, { dateLabel, dateKey, segments: [], totalDistM: 0, totalMovingMin: 0, tripCount: 0, stayCount: 0 });
    }
    const g = map.get(dateKey)!;
    g.segments.push(seg);
    if (seg.type === 'trip') {
      g.totalDistM += seg.distance ?? 0;
      g.totalMovingMin += seg.durationMinutes;
      g.tripCount++;
    } else {
      g.stayCount++;
    }
  }

  return [...map.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LocationHistory({
  members,
  onHistoryLoaded,
  onClose,
  onPlaybackChange,
  initialMemberId,
}: Props) {
  const { language } = useLanguage();
  const t = TEXT[language];
  const ranges = TIME_RANGES[language];
  const { toast } = useToast();

  const [selectedMember, setSelectedMember] = useState(initialMemberId || '');
  const [selectedRange, setSelectedRange] = useState('3h');
  const [loading, setLoading] = useState(false);
  const [trail, setTrail] = useState<Tables<'user_locations'>[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackTimer, setPlaybackTimer] = useState<number | null>(null);

  // Address cache: key = "lat4,lng4" → address string
  const [addresses, setAddresses] = useState<Record<string, string>>({});

  // Refs for auto-scroll: keyed by segment startTime
  const segmentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const trips = useMemo(() => detectTrips(trail), [trail]);
  const dayGroups = useMemo(() => buildDayGroups(trips, language), [trips, language]);

  // ── Geocode all stay points when trips change ──────────────────────────────
  useEffect(() => {
    const stayPoints = trips
      .filter((s) => s.type === 'stay')
      .map((s) => s.startLocation);

    if (stayPoints.length === 0) return;

    batchReverseGeocode(stayPoints, (key, address) => {
      setAddresses((prev) => (prev[key] === address ? prev : { ...prev, [key]: address }));
    });
  }, [trips]);

  // ── Auto-scroll list to active segment during playback ────────────────────
  useEffect(() => {
    if (playbackIndex === -1) return;
    const currentPoint = trail[playbackIndex];
    if (!currentPoint) return;
    const activeSeg = trips.find((seg) => seg.points.includes(currentPoint));
    if (activeSeg) {
      segmentRefs.current[activeSeg.startTime]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [playbackIndex, trail, trips]);

  // ── Playback controls ──────────────────────────────────────────────────────
  const stopPlayback = useCallback(() => {
    if (playbackTimer) window.clearInterval(playbackTimer);
    setPlaybackTimer(null);
    setIsPlaying(false);
  }, [playbackTimer]);

  const startPlayback = useCallback(
    (speed: number) => {
      if (playbackTimer) window.clearInterval(playbackTimer);
      const startIdx = playbackIndex <= 0 || playbackIndex >= trail.length - 1
        ? trail.length - 1
        : playbackIndex;
      setPlaybackIndex(startIdx);
      setIsPlaying(true);
      const timer = window.setInterval(() => {
        setPlaybackIndex((prev) => {
          if (prev <= 0) {
            window.clearInterval(timer);
            setIsPlaying(false);
            return 0;
          }
          return prev - 1;
        });
      }, 500 / speed);
      setPlaybackTimer(timer);
    },
    [playbackIndex, playbackTimer, trail.length]
  );

  const togglePlayback = () => (isPlaying ? stopPlayback() : startPlayback(playbackSpeed));

  const nextPlaybackSpeed = () => {
    const speeds = [1, 2, 4, 8];
    const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
    setPlaybackSpeed(next);
    if (isPlaying) startPlayback(next);
  };

  const handleSeek = (index: number) => {
    setPlaybackIndex(index);
    if (onPlaybackChange && trail[index]) onPlaybackChange(trail[index]);
  };

  const handleSegmentClick = (seg: TripSegment) => {
    const idx = trail.indexOf(seg.points[0]);
    if (idx !== -1) handleSeek(idx);
  };

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!selectedMember) return;
    setLoading(true);
    stopPlayback();
    setPlaybackIndex(-1);

    try {
      const range = ranges.find((r) => r.value === selectedRange);
      const since = new Date(
        getServerNow().getTime() - (range?.hours ?? 3) * 60 * 60 * 1000
      ).toISOString();

      const { data, error } = await supabase
        .from('user_locations')
        .select('*')
        .eq('user_id', selectedMember)
        .gte('timestamp', since)
        .order('timestamp', { ascending: false })
        .limit(2000);

      if (error) throw error;

      const result = data ?? [];
      setTrail(result);
      onHistoryLoaded(result, 'list');
      if (result.length > 0) setPlaybackIndex(result.length - 1);
    } catch (err: any) {
      console.error('History load error:', err);
      toast({ title: t.error, description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMember, selectedRange]);

  useEffect(() => {
    if (initialMemberId && members.some((m) => m.user_id === initialMemberId)) {
      setSelectedMember(initialMemberId);
    } else if (!selectedMember && members.length > 0) {
      setSelectedMember(members[0].user_id);
    }
  }, [initialMemberId, members]);

  useEffect(() => {
    if (selectedMember) loadHistory();
  }, [selectedMember, selectedRange]);

  useEffect(() => {
    return () => { if (playbackTimer) window.clearInterval(playbackTimer); };
  }, [playbackTimer]);

  useEffect(() => {
    if (playbackIndex !== -1 && onPlaybackChange && trail[playbackIndex]) {
      onPlaybackChange(trail[playbackIndex]);
    }
  }, [playbackIndex, trail]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getAddress = (seg: TripSegment): string => {
    const key = getCacheKey(seg.startLocation.lat, seg.startLocation.lng);
    return addresses[key] || t.loadingAddr;
  };

  const isAddressLoaded = (seg: TripSegment): boolean => {
    const key = getCacheKey(seg.startLocation.lat, seg.startLocation.lng);
    return key in addresses;
  };

  const isSegmentActive = (seg: TripSegment): boolean =>
    playbackIndex !== -1 && trail[playbackIndex] !== undefined && seg.points.includes(trail[playbackIndex]);

  const currentTimestamp = playbackIndex !== -1 && trail[playbackIndex]
    ? trail[playbackIndex].timestamp
    : null;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Sheet open={true} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="p-0 w-full sm:max-w-md border-white/10 glass glass-dark flex flex-col z-[1002]"
      >
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <SheetHeader className="p-5 pb-3 border-b border-white/5 bg-black/20 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <SheetTitle className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              {t.title}
            </SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-white/10"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Member + refresh */}
          <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger className="h-10 glass glass-light border-none font-semibold text-sm focus:ring-0">
                <SelectValue placeholder={t.pickMember} />
              </SelectTrigger>
              <SelectContent className="glass glass-dark border-white/10">
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id} className="text-sm">
                    {m.profile.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="secondary"
              className="h-10 w-10 glass glass-light hover:bg-primary/20 hover:text-primary transition-all active:scale-95"
              onClick={loadHistory}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />}
            </Button>
          </div>

          {/* Time range filter — horizontal scroll on small viewports */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {ranges.map((r) => (
              <Button
                key={r.value}
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 px-2.5 text-[11px] font-black rounded-lg whitespace-nowrap shrink-0 transition-all',
                  selectedRange === r.value
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'glass glass-light text-foreground/60 hover:text-foreground'
                )}
                onClick={() => setSelectedRange(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </SheetHeader>

        {/* ── Content ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                <History className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
              </div>
              <p className="text-sm font-bold text-muted-foreground animate-pulse">{t.loading}</p>
            </div>
          ) : trail.length === 0 ? (
            /* ── Empty state ─────────────────────────────────────────────────── */
            <div className="flex-1 p-12 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-6 relative">
                <MapPin className="w-12 h-12 text-muted-foreground/20" />
                <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center border border-destructive/20">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </div>
              </div>
              <h4 className="text-xl font-black text-foreground mb-2 uppercase tracking-tight">
                {t.noData}
              </h4>
              <p className="text-sm text-muted-foreground font-medium max-w-[240px] mb-6">
                {t.noDataDesc}
              </p>
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 flex gap-3 text-left">
                <InfoIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-primary/80 font-semibold">{t.suggestRange}</p>
              </div>
            </div>
          ) : (
            /* ── Trip list ───────────────────────────────────────────────────── */
            <ScrollArea className="flex-1 min-h-0" ref={scrollAreaRef as any}>
              <div className="px-4 pt-3 pb-24 space-y-5">
                {dayGroups.map((group) => (
                  <div key={group.dateKey}>
                    {/* Day header */}
                    <div className="sticky top-0 z-10 py-2 mb-3 bg-background/80 backdrop-blur-sm">
                      <div className="flex items-center gap-3 mb-1.5">
                        <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="text-xs font-black uppercase tracking-widest text-primary">
                          {group.dateLabel}
                        </span>
                        <div className="flex-1 h-px bg-white/5" />
                      </div>
                      {/* Day summary pills */}
                      <div className="flex gap-2 flex-wrap pl-6">
                        {group.tripCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black text-primary">
                            <Route className="w-3 h-3" />
                            {group.totalDistM >= 1000
                              ? `${(group.totalDistM / 1000).toFixed(1)} km`
                              : `${group.totalDistM} m`}
                          </span>
                        )}
                        {group.tripCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-muted-foreground">
                            <Navigation className="w-3 h-3" />
                            {group.tripCount} {t.trips}
                          </span>
                        )}
                        {group.stayCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-[10px] font-black text-orange-400">
                            <MapPin className="w-3 h-3" />
                            {group.stayCount} {t.stops}
                          </span>
                        )}
                        {group.totalMovingMin > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {group.totalMovingMin >= 60
                              ? `${Math.floor(group.totalMovingMin / 60)}g${group.totalMovingMin % 60}p`
                              : `${group.totalMovingMin} phút`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Segment cards */}
                    <div className="relative space-y-3">
                      {/* Timeline vertical line */}
                      <div className="absolute left-[17px] top-2 bottom-2 w-[2px] bg-gradient-to-b from-primary/40 via-primary/10 to-transparent z-0 pointer-events-none" />

                      {group.segments.map((seg, i) => {
                        const active = isSegmentActive(seg);
                        const isTrip = seg.type === 'trip';
                        const actType = isTrip ? getActivityType(seg.avgSpeed ?? 0) : 'stationary';
                        const address = !isTrip ? getAddress(seg) : null;
                        const addrLoaded = !isTrip ? isAddressLoaded(seg) : true;

                        return (
                          <div
                            key={seg.startTime}
                            ref={(el) => { segmentRefs.current[seg.startTime] = el; }}
                            className={cn(
                              'relative z-10 grid grid-cols-[36px_1fr] gap-3 group cursor-pointer',
                              'animate-in fade-in slide-in-from-right-4 duration-300 fill-mode-both'
                            )}
                            style={{ animationDelay: `${i * 40}ms` }}
                            onClick={() => handleSegmentClick(seg)}
                          >
                            {/* Icon */}
                            <div className="flex flex-col items-center pt-0.5">
                              <div
                                className={cn(
                                  'w-8 h-8 rounded-xl flex items-center justify-center border transition-all shadow-md',
                                  isTrip
                                    ? 'bg-primary/20 border-primary/30 text-primary shadow-primary/10'
                                    : 'bg-orange-500/20 border-orange-500/30 text-orange-400 shadow-orange-500/10',
                                  active && 'scale-110 ring-2 ring-offset-1 ring-offset-background',
                                  active && (isTrip ? 'ring-primary' : 'ring-orange-500')
                                )}
                              >
                                {isTrip
                                  ? <ActivityIcon avgSpeedMs={seg.avgSpeed ?? 0} />
                                  : <MapPin className="w-4 h-4" />
                                }
                              </div>
                            </div>

                            {/* Card */}
                            <div
                              className={cn(
                                'rounded-2xl p-3.5 border transition-all duration-200',
                                'glass glass-light border-white/5',
                                'group-hover:bg-white/10 group-hover:border-white/10 group-hover:translate-x-0.5',
                                active && 'bg-primary/10 border-primary/25 ring-1 ring-primary/30'
                              )}
                            >
                              {/* Top row: badge + time + duration */}
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        'text-[9px] uppercase font-black px-1.5 h-4 rounded-md shrink-0',
                                        isTrip
                                          ? 'bg-primary/20 text-primary border-primary/30'
                                          : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                                      )}
                                    >
                                      {isTrip ? t.trip : t.stay}
                                    </Badge>
                                    <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                                      {format(new Date(seg.startTime), 'HH:mm')}
                                      {' — '}
                                      {format(new Date(seg.endTime), 'HH:mm')}
                                    </span>
                                  </div>

                                  {/* Main label: activity type OR address */}
                                  {isTrip ? (
                                    <p className="text-sm font-bold text-foreground tracking-tight truncate">
                                      {getActivityLabel(seg.avgSpeed ?? 0, language)}
                                    </p>
                                  ) : (
                                    <p
                                      className={cn(
                                        'text-sm font-bold leading-snug line-clamp-2',
                                        addrLoaded ? 'text-foreground' : 'text-muted-foreground/50 animate-pulse'
                                      )}
                                    >
                                      {address}
                                    </p>
                                  )}
                                </div>

                                {/* Duration */}
                                <div className="text-right shrink-0">
                                  <span className="text-sm font-black text-foreground block leading-none tabular-nums">
                                    {seg.durationMinutes >= 60
                                      ? `${Math.floor(seg.durationMinutes / 60)}h${seg.durationMinutes % 60}m`
                                      : `${seg.durationMinutes}m`}
                                  </span>
                                </div>
                              </div>

                              {/* Trip stats */}
                              {isTrip && (
                                <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-white/5">
                                  <StatCell
                                    label={t.distance}
                                    value={
                                      (seg.distance ?? 0) >= 1000
                                        ? `${((seg.distance ?? 0) / 1000).toFixed(1)} km`
                                        : `${seg.distance ?? 0} m`
                                    }
                                  />
                                  <StatCell
                                    label={t.avgSpeed}
                                    value={`${Math.round((seg.avgSpeed ?? 0) * 3.6)} km/h`}
                                  />
                                  <StatCell
                                    label={t.maxSpeed}
                                    value={`${Math.round((seg.maxSpeed ?? 0) * 3.6)} km/h`}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* ── Playback bar ─────────────────────────────────────────────────── */}
        {trail.length > 0 && (
          <div className="shrink-0 px-5 py-4 bg-black/50 backdrop-blur-xl border-t border-white/10 space-y-3">
            {/* Timestamp row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span className="text-sm font-black text-foreground tabular-nums tracking-tight">
                  {currentTimestamp
                    ? format(new Date(currentTimestamp), 'HH:mm:ss')
                    : '--:--:--'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-3 h-3 text-muted-foreground" />
                <span className="text-[11px] font-bold text-muted-foreground">
                  {currentTimestamp
                    ? format(new Date(currentTimestamp), 'dd/MM/yyyy')
                    : '--/--/----'}
                </span>
              </div>
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                className={cn(
                  'h-11 w-11 rounded-full shadow-xl transition-all transform active:scale-90 shrink-0',
                  isPlaying
                    ? 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                    : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/30'
                )}
                onClick={togglePlayback}
              >
                {isPlaying
                  ? <Pause className="w-4 h-4 fill-current" />
                  : <Play className="w-4 h-4 fill-current ml-0.5" />
                }
              </Button>

              <div className="flex-1 flex flex-col gap-1.5">
                <input
                  type="range"
                  min="0"
                  max={trail.length - 1}
                  value={playbackIndex === -1 ? trail.length - 1 : playbackIndex}
                  onChange={(e) => handleSeek(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary slider-thumb"
                  dir="rtl"
                />
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest leading-none">
                    Timeline
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 text-[10px] font-black bg-white/5 hover:bg-white/10 rounded-md ring-1 ring-white/10 flex items-center gap-1"
                    onClick={nextPlaybackSpeed}
                  >
                    {playbackSpeed}X <FastForward className="w-3 h-3 fill-current" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .slider-thumb { -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.1); cursor: pointer; }
        .slider-thumb::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 14px; height: 14px; background: #6D28D9; border-radius: 50%;
          border: 2px solid white; box-shadow: 0 0 12px rgba(109,40,217,0.5);
          cursor: pointer; transition: all 0.15s;
        }
        .slider-thumb::-webkit-slider-thumb:hover { transform: scale(1.3); box-shadow: 0 0 18px rgba(109,40,217,0.7); }
      `}} />
    </Sheet>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest block">{label}</span>
      <p className="text-[11px] font-bold text-foreground">{value}</p>
    </div>
  );
}

function InfoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}
