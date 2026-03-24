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
  ChevronDown, Info, PlayCircle, PauseCircle, ChevronRight,
  Activity, Gauge, Map as MapIcon, CircleDot, RefreshCw,
  Search, Info as InfoIcon, MoreHorizontal, SkipForward
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

function ActivityIcon({ avgSpeedKmh, className }: { avgSpeedKmh: number; className?: string }) {
  const type = getActivityType(avgSpeedKmh);
  const iconClass = cn('w-4 h-4', className);
  
  const config = {
    driving: { icon: Car, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
    cycling: { icon: Bike, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
    walking: { icon: Footprints, color: 'text-orange-500 bg-orange-500/10 border-orange-500/20' }
  };
  
  const { icon: Icon, color } = config[type] || { icon: MapPin, color: 'text-slate-500 bg-slate-500/10 border-slate-500/20' };
  
  return (
    <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-sm border', color)}>
      <Icon className={iconClass} />
    </div>
  );
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
        inline: 'start',
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
    <Sheet open={true} onOpenChange={(open) => !open && onClose()} modal={false}>
      <SheetContent
        side="right"
        hideOverlay
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="p-0 w-full sm:max-w-[420px] border-l border-border/40 glass-sidebar flex flex-col z-[1002] shadow-2xl overflow-hidden"
      >
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="relative shrink-0 overflow-hidden pt-6 pb-4 px-6 border-b border-border/40 bg-background/50 backdrop-blur-md">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-[60px] rounded-full -mr-10 -mt-10" />
          
          <div className="flex items-center justify-between mb-5 relative z-10">
            <div className="space-y-0.5">
              <h3 className="text-xl font-black text-foreground uppercase tracking-tight flex items-center gap-2.5">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <History className="w-5 h-5 text-primary" />
                </div>
                {t.title}
              </h3>
              <p className="text-[10px] text-muted-foreground/60 font-black tracking-widest uppercase opacity-60">
                Timeline & Playback v2
              </p>
            </div>
            <div className="flex-1" /> {/* Spacer if needed */}
          </div>

          <div className="space-y-4 relative z-10">
            {/* Member Select */}
            <div className="relative group">
              <Select value={selectedMember} onValueChange={setSelectedMember}>
                <SelectTrigger className="h-12 bg-black/5 dark:bg-white/5 border-border/20 rounded-2xl font-bold text-sm focus:ring-0 transition-all hover:bg-black/10 dark:hover:bg-white/10 text-foreground pl-11">
                  <div className="absolute left-3.5 p-1.5 bg-black/5 dark:bg-white/5 rounded-lg group-hover:scale-110 transition-transform">
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <SelectValue placeholder={t.pickMember} />
                </SelectTrigger>
                <SelectContent className="glass glass-sidebar border-border/40 rounded-2xl p-1 z-[1003]">
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id} className="text-sm rounded-xl py-2.5 focus:bg-primary/10 cursor-pointer">
                      <div className="flex items-center gap-2.5">
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full border border-background shadow-sm", 
                          m.profile.status === 'online' ? 'bg-emerald-500 ring-2 ring-emerald-500/20' : 
                          m.profile.status === 'idle' ? 'bg-amber-500 ring-2 ring-amber-500/20' : 
                          'bg-slate-400'
                        )} />
                        <span className="font-bold">{m.profile.display_name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time filters */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-6 px-6">
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "h-8 w-8 rounded-xl shrink-0 transition-all",
                  loading ? "bg-primary/10 text-primary" : "bg-black/5 dark:bg-white/5 text-muted-foreground hover:text-foreground hover:bg-black/10"
                )}
                onClick={loadHistory}
                disabled={loading}
              >
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              </Button>
              <div className="w-px h-6 bg-border/20 self-center mx-1 shrink-0" />
              {ranges.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setSelectedRange(r.value)}
                  className={cn(
                    'h-8 px-4 text-[11px] font-black rounded-xl whitespace-nowrap shrink-0 transition-all uppercase tracking-wider border',
                    selectedRange === r.value
                      ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105'
                      : 'bg-black/5 dark:bg-white/5 border-transparent text-muted-foreground/60 hover:text-foreground hover:bg-black/10'
                  )}
                >
                  {r.label}
                </button>
              ))}
              <div className="w-4 shrink-0" /> {/* Spacer to prevent right clipping */}
            </div>
          </div>
        </div>

        {/* ── Content ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative flex flex-col min-h-0 bg-black/[0.02] dark:bg-white/[0.02]">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-[3px] border-primary/10 border-t-primary animate-spin" />
                <History className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
              </div>
              <p className="text-[12px] font-black text-primary uppercase tracking-[0.2em] animate-pulse">{t.loading}</p>
            </div>
          ) : trail.length === 0 ? (
            <div className="flex-1 p-12 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 rounded-[32px] bg-black/[0.03] dark:bg-white/[0.03] border border-border/20 flex items-center justify-center mb-8 relative rotate-12">
                <MapPin className="w-10 h-10 text-muted-foreground/30 -rotate-12" />
                <div className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center border border-destructive/20 shadow-xl">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </div>
              </div>
              <h4 className="text-2xl font-black text-foreground mb-3 uppercase tracking-tight">
                {t.noData}
              </h4>
              <p className="text-sm text-muted-foreground/60 font-medium max-w-[260px] mb-8 leading-relaxed">
                {t.noDataDesc}
              </p>
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 flex gap-3 text-left max-w-xs transition-all hover:bg-primary/10">
                <div className="p-1.5 bg-primary/20 rounded-lg shrink-0">
                  <InfoIcon className="w-4 h-4 text-primary" />
                </div>
                <p className="text-[11px] text-primary/80 font-bold uppercase tracking-tight leading-normal">{t.suggestRange}</p>
              </div>
            </div>
          ) : (
            <>
              {/* ── Trip list ───────────────────────────────────────────────────── */}
              <ScrollArea className="flex-1 min-h-0" ref={scrollAreaRef as any}>
                <div className="px-5 pt-6 pb-40 space-y-8">
                  {dayGroups.map((group) => (
                    <div key={group.dateKey} className="relative">
                      {/* Day header */}
                      <div className="sticky top-0 z-20 -mx-5 px-5 py-3 mb-6 bg-background/80 backdrop-blur-md border-y border-border/20 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Calendar className="w-4 h-4 text-primary" />
                          </div>
                          <span className="text-sm font-black uppercase tracking-[0.15em] text-foreground">
                            {group.dateLabel}
                          </span>
                        </div>
                        
                        <div className="flex gap-2">
                          {group.tripCount > 0 && (
                            <div className="bg-black/5 dark:bg-white/5 rounded-lg px-2 py-1 flex items-center gap-1.5 border border-border/40">
                              <Navigation className="w-3 h-3 text-primary" />
                              <span className="text-[10px] font-black text-foreground">{group.tripCount}</span>
                            </div>
                          )}
                          {group.stayCount > 0 && (
                            <div className="bg-black/5 dark:bg-white/5 rounded-lg px-2 py-1 flex items-center gap-1.5 border border-border/40">
                              <MapPin className="w-3 h-3 text-orange-400" />
                              <span className="text-[10px] font-black text-foreground">{group.stayCount}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Segment cards */}
                      <div className="relative space-y-4 pl-4">
                        {/* Bolder timeline track */}
                        <div className="absolute left-[13px] top-6 bottom-6 w-0.5 bg-gradient-to-b from-primary/30 via-border/20 to-transparent z-0 pointer-events-none rounded-full" />

                        {group.segments.map((seg, i) => {
                          const active = isSegmentActive(seg);
                          const isTrip = seg.type === 'trip';
                          const address = !isTrip ? getAddress(seg) : null;
                          const addrLoaded = !isTrip ? isAddressLoaded(seg) : true;

                          return (
                            <div
                              key={seg.startTime}
                              ref={(el) => { segmentRefs.current[seg.startTime] = el; }}
                              className={cn(
                                'relative z-10 grid grid-cols-[28px_1fr] gap-4 group cursor-pointer transition-all duration-500',
                                active ? 'scale-100 opacity-100' : 'hover:translate-x-1'
                              )}
                              onClick={() => handleSegmentClick(seg)}
                            >
                              {/* Icon Column */}
                              <div className="flex flex-col items-center pt-2">
                                <div className={cn(
                                  "w-6 h-6 rounded-full border-2 border-background z-10 shadow-lg flex items-center justify-center transition-all duration-300",
                                  active ? (isTrip ? "bg-primary scale-125 ring-4 ring-primary/20" : "bg-orange-500 scale-125 ring-4 ring-orange-500/20") 
                                         : (isTrip ? "bg-primary/40" : "bg-orange-400/40")
                                )}>
                                  {isTrip ? <Route className="w-3 h-3 text-white" /> : <CircleDot className="w-3 h-3 text-white" />}
                                </div>
                              </div>

                              {/* Card Body */}
                              <div className={cn(
                                'rounded-2xl p-4 transition-all duration-300 relative overflow-hidden',
                                'border backdrop-blur-xl',
                                active 
                                  ? 'bg-primary/10 border-primary/40' 
                                  : 'bg-black/[0.03] dark:bg-white/[0.04] border-black/5 dark:border-white/10 hover:bg-black/[0.06] dark:hover:bg-white/[0.08]'
                              )}>
                                {/* Glowing stripe for active */}
                                {active && (
                                  <div className={cn(
                                    "absolute top-0 left-0 bottom-0 w-1",
                                    isTrip ? "bg-primary shadow-[2px_0_15px_rgba(59,130,246,0.6)]" : "bg-orange-500 shadow-[2px_0_15px_rgba(249,115,22,0.6)]"
                                  )} />
                                )}

                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          'text-[9px] uppercase font-black px-2 h-4.5 rounded-full border-0 tracking-widest shadow-sm',
                                          isTrip ? 'bg-primary/20 text-primary' : 'bg-orange-500/20 text-orange-600'
                                        )}
                                      >
                                        {isTrip ? t.trip : t.stay}
                                      </Badge>
                                      <div className="flex items-center gap-1.5 text-muted-foreground/80">
                                        <Clock className="w-3 h-3" />
                                        <span className="text-[10px] font-black tabular-nums text-muted-foreground">
                                          {format(new Date(seg.startTime), 'HH:mm')}
                                          <span className="mx-1 opacity-30">—</span>
                                          {format(new Date(seg.endTime), 'HH:mm')}
                                        </span>
                                      </div>
                                    </div>

                                    {isTrip ? (
                                      <div className="flex items-center gap-3">
                                        <ActivityIcon avgSpeedKmh={seg.avgSpeed ?? 0} />
                                        <p className="text-sm font-black text-foreground tracking-tight leading-tight">
                                          {getActivityLabel(getActivityType(seg.avgSpeed ?? 0), language)}
                                        </p>
                                      </div>
                                    ) : (
                                      <div className="flex gap-3 items-start">
                                        <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0 shadow-inner">
                                          <MapPin className="w-4 h-4 text-orange-500" />
                                        </div>
                                        <p className={cn(
                                          'text-sm font-bold leading-relaxed line-clamp-2',
                                          addrLoaded ? 'text-foreground' : 'text-foreground/20 animate-pulse'
                                        )}>
                                          {address}
                                        </p>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex flex-col items-end shrink-0 pt-0.5">
                                    <span className="text-base font-black text-foreground block tracking-tighter tabular-nums">
                                      {seg.durationMinutes >= 60
                                        ? `${Math.floor(seg.durationMinutes / 60)}h${seg.durationMinutes % 60}m`
                                        : `${seg.durationMinutes}m`}
                                    </span>
                                    {isTrip && (
                                      <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-tighter">
                                        {((seg.distance ?? 0) >= 1000) ? `${((seg.distance ?? 0) / 1000).toFixed(1)} km` : `${seg.distance} m`}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {isTrip && (
                                  <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border/10">
                                    <div className="flex items-center gap-2 bg-black/[0.02] dark:bg-white/[0.03] p-2 rounded-xl">
                                      <div className="p-1.5 bg-blue-500/10 rounded-lg">
                                        <Gauge className="w-3.5 h-3.5 text-blue-500" />
                                      </div>
                                      <div className="min-w-0">
                                        <span className="block text-[8px] font-black text-muted-foreground/60 uppercase tracking-widest leading-none mb-1">{t.avgSpeed}</span>
                                        <span className="block text-[11px] font-black text-foreground tabular-nums leading-none">{Math.round(seg.avgSpeed ?? 0)} <span className="text-[8px] opacity-40">KM/H</span></span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 bg-black/[0.02] dark:bg-white/[0.03] p-2 rounded-xl">
                                      <div className="p-1.5 bg-purple-500/10 rounded-lg">
                                        <Activity className="w-3.5 h-3.5 text-purple-500" />
                                      </div>
                                      <div className="min-w-0">
                                        <span className="block text-[8px] font-black text-muted-foreground/60 uppercase tracking-widest leading-none mb-1">{t.maxSpeed}</span>
                                        <span className="block text-[11px] font-black text-foreground tabular-nums leading-none">{Math.round(seg.maxSpeed ?? 0)} <span className="text-[8px] opacity-40">KM/H</span></span>
                                      </div>
                                    </div>
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

              {/* ── Playback Controls: Dynamic Island Style ───────────────────────── */}
              {trail.length > 0 && !loading && (
                <div className="absolute bottom-8 left-6 right-6 z-40 animate-in slide-in-from-bottom-6 duration-700">
                  <div className="bg-background/95 dark:bg-[#1A1C1E]/95 backdrop-blur-2xl border border-border/40 rounded-[28px] p-5 shadow-[0_25px_60px_rgba(0,0,0,0.15)]">
                    <div className="flex flex-col gap-4">
                      {/* Info Header */}
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-xl animate-pulse">
                            <Navigation className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-black text-foreground tabular-nums tracking-tight">
                              {currentTimestamp ? format(new Date(currentTimestamp), 'HH:mm:ss') : '--:--:--'}
                            </span>
                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none">
                              {currentTimestamp ? format(new Date(currentTimestamp), 'dd/MM/yyyy') : 'Timeline'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-3 text-[10px] font-black bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl flex items-center gap-2 text-foreground border border-border/20 transition-all active:scale-95"
                            onClick={nextPlaybackSpeed}
                          >
                            <span className="text-primary font-black uppercase text-[9px] tracking-widest">{playbackSpeed}X</span>
                            <SkipForward className="w-3.5 h-3.5 fill-current text-primary" />
                          </Button>
                        </div>
                      </div>

                      {/* Player & Slider */}
                      <div className="flex items-center gap-4">
                        <Button
                          size="icon"
                          className={cn(
                            "h-12 w-12 rounded-2xl shrink-0 transition-all active:scale-90",
                            isPlaying 
                              ? "bg-primary shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:bg-primary/90 text-white" 
                              : "bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-foreground"
                          )}
                          onClick={togglePlayback}
                        >
                          {isPlaying
                            ? <PauseCircle className="w-7 h-7" />
                            : <PlayCircle className="w-7 h-7 ml-0.5" />
                          }
                        </Button>

                        <div className="flex-1 px-1 group">
                          <input
                            type="range"
                            min="0"
                            max={trail.length - 1}
                            value={playbackIndex === -1 ? trail.length - 1 : playbackIndex}
                            onChange={(e) => handleSeek(parseInt(e.target.value))}
                            className="w-full h-2 bg-black/10 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-primary slider-custom transition-all group-hover:h-3"
                            dir="rtl"
                          />
                          <div className="flex justify-between mt-2.5 px-0.5">
                            <span className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest">{t.trip} Start</span>
                            <div className="flex gap-1.5 items-center">
                              <div className={cn("w-1 h-1 rounded-full", isPlaying ? "bg-primary animate-ping" : "bg-black/20 dark:bg-white/20")} />
                              <span className="text-[8px] font-black text-primary/60 uppercase tracking-widest">Live View</span>
                            </div>
                            <span className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest">{t.today}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          .no-scrollbar::-webkit-scrollbar { display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          .slider-custom { -webkit-appearance: none; appearance: none; background: rgba(0,0,0,0.05); }
          .slider-custom::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none;
            width: 20px; height: 20px; background: #3B82F6; border-radius: 9px;
            border: 3px solid #FFFFFF; box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            cursor: pointer; transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          }
          .slider-custom::-webkit-slider-thumb:hover { transform: scale(1.15); background: #2563EB; box-shadow: 0 6px 20px rgba(59,130,246,0.3); }
          .slider-custom::-moz-range-thumb {
            width: 20px; height: 20px; background: #3B82F6; border-radius: 9px;
            border: 3px solid #FFFFFF; cursor: pointer; transition: all 0.2s;
          }
          .glass-sidebar { 
            background: hsl(var(--background) / 0.8); 
            backdrop-filter: blur(24px) saturate(1.5); 
            -webkit-backdrop-filter: blur(24px) saturate(1.5); 
          }
        `}} />
      </SheetContent>
    </Sheet>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[8px] text-muted-foreground uppercase font-black tracking-widest block opacity-70">{label}</span>
      <p className="text-[11px] font-black text-foreground tabular-nums">{value}</p>
    </div>
  );
}
