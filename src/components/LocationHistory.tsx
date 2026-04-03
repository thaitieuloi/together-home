import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  History, X, Loader2, Navigation, MapPin, Clock, Play, Pause,
  FastForward, Calendar, Car, Bike, Footprints, Route,
  ChevronDown, ChevronRight, ChevronUp,
  Gauge, CircleDot, RefreshCw,
  SkipForward, ArrowRight, Timer, Zap,
  PauseCircle, PlayCircle, Filter
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { vi as viLocale, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getServerNow } from '@/lib/time';
import { detectTrips, TripSegment, getActivityType, getActivityLabel } from '@/lib/tripUtils';
import { batchReverseGeocode, getCacheKey } from '@/lib/geocoding';
import { useToast } from '@/hooks/use-toast';
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface Props {
  members: FamilyMemberWithProfile[];
  onHistoryLoaded: (trail: Tables<'user_locations'>[], mode: 'map' | 'list') => void;
  onClose: () => void;
  onPlaybackChange?: (point: Tables<'user_locations'> | null) => void;
  initialMemberId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIME_RANGES = [
  { label: '3h', value: '3h', hours: 3 },
  { label: '6h', value: '6h', hours: 6 },
  { label: '12h', value: '12h', hours: 12 },
  { label: '24h', value: '24h', hours: 24 },
  { label: '3d', value: '3d', hours: 72 },
  { label: '7d', value: '7d', hours: 168 },
];

const TEXT = {
  vi: {
    title: 'Lịch sử',
    pickMember: 'Chọn thành viên',
    noData: 'Chưa có dữ liệu',
    noDataDesc: 'Không có lịch sử trong khoảng thời gian này',
    suggestRange: 'Thử chọn mốc thời gian dài hơn',
    trip: 'Chuyến đi',
    stay: 'Dừng lại',
    distance: 'Quãng đường',
    avgSpeed: 'TB',
    maxSpeed: 'Max',
    loading: 'Đang tải...',
    loadingAddr: 'Đang tải địa chỉ...',
    today: 'Hôm nay',
    yesterday: 'Hôm qua',
    totalDist: 'Tổng',
    movingTime: 'Di chuyển',
    trips: 'chuyến',
    stops: 'dừng',
    speed: 'km/h',
    custom: 'Tuỳ chỉnh',
    apply: 'Áp dụng',
    fromDate: 'Từ',
    toDate: 'Đến',
    allDay: 'Cả ngày',
    filters: 'Bộ lọc',
  },
  en: {
    title: 'History',
    pickMember: 'Select member',
    noData: 'No data found',
    noDataDesc: 'No location history in this time range',
    suggestRange: 'Try selecting a longer time range',
    trip: 'Trip',
    stay: 'Stop',
    distance: 'Distance',
    avgSpeed: 'Avg',
    maxSpeed: 'Max',
    loading: 'Loading...',
    loadingAddr: 'Loading address...',
    today: 'Today',
    yesterday: 'Yesterday',
    totalDist: 'Total',
    movingTime: 'Moving',
    trips: 'trips',
    stops: 'stops',
    speed: 'km/h',
    custom: 'Custom',
    apply: 'Apply',
    fromDate: 'From',
    toDate: 'To',
    allDay: 'All Day',
    filters: 'Filters',
  },
};

// ─── Activity config ──────────────────────────────────────────────────────────

const ACTIVITY_CONFIG = {
  driving: { icon: Car, color: '#3B82F6', bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', label: { vi: 'Lái xe', en: 'Driving' } },
  cycling: { icon: Bike, color: '#10B981', bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', label: { vi: 'Đạp xe', en: 'Cycling' } },
  walking: { icon: Footprints, color: '#F59E0B', bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', label: { vi: 'Đi bộ', en: 'Walking' } },
} as const;

// ─── Day group ────────────────────────────────────────────────────────────────

interface DayGroup {
  dateLabel: string;
  dateKey: string;
  segments: TripSegment[];
  totalDistKm: number;
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
      let dateLabel = format(new Date(seg.startTime), 'EEEE, dd/MM', { locale: lang === 'vi' ? viLocale : enUS });
      if (dateKey === todayKey) dateLabel = t.today;
      else if (dateKey === yesterdayKey) dateLabel = t.yesterday;

      map.set(dateKey, { dateLabel, dateKey, segments: [], totalDistKm: 0, totalMovingMin: 0, tripCount: 0, stayCount: 0 });
    }
    const g = map.get(dateKey)!;
    g.segments.push(seg);
    if (seg.type === 'trip') {
      g.totalDistKm += (seg.distance ?? 0) / 1000;
      g.totalMovingMin += seg.durationMinutes;
      g.tripCount++;
    } else {
      g.stayCount++;
    }
  }

  return [...map.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDuration(min: number): string {
  if (min < 1) return '<1m';
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function formatDist(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
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
  const { toast } = useToast();

  const [selectedMember, setSelectedMember] = useState(initialMemberId || '');
  const [selectedRange, setSelectedRange] = useState('3h');
  const [loading, setLoading] = useState(false);
  const [trail, setTrail] = useState<Tables<'user_locations'>[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackTimer, setPlaybackTimer] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customFrom, setCustomFrom] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  // Address cache
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const segmentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const trips = useMemo(() => detectTrips(trail), [trail]);
  const dayGroups = useMemo(() => buildDayGroups(trips, language), [trips, language]);

  // ── Geocode stays ───────────────────────────────────────────────────────────
  useEffect(() => {
    const stayPoints = trips
      .filter((s) => s.type === 'stay')
      .map((s) => s.startLocation);
    if (stayPoints.length === 0) return;
    batchReverseGeocode(stayPoints, (key, address) => {
      setAddresses((prev) => (prev[key] === address ? prev : { ...prev, [key]: address }));
    });
  }, [trips]);

  // Geocode trip start/end for from→to display
  useEffect(() => {
    const tripEnds = trips
      .filter((s) => s.type === 'trip')
      .flatMap((s) => [s.startLocation, s.endLocation]);
    if (tripEnds.length === 0) return;
    batchReverseGeocode(tripEnds, (key, address) => {
      setAddresses((prev) => (prev[key] === address ? prev : { ...prev, [key]: address }));
    });
  }, [trips]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
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

  // ── Playback ────────────────────────────────────────────────────────────────
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

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!selectedMember) return;
    setLoading(true);
    stopPlayback();
    setPlaybackIndex(-1);

    try {
      let since: string;
      let until: string | undefined;

      if (useCustomRange) {
        since = new Date(`${customFrom}T00:00:00`).toISOString();
        until = new Date(`${customTo}T23:59:59`).toISOString();
      } else {
        const range = TIME_RANGES.find((r) => r.value === selectedRange);
        since = new Date(
          getServerNow().getTime() - (range?.hours ?? 3) * 60 * 60 * 1000
        ).toISOString();
      }

      const query = supabase
        .from('user_locations')
        .select('*')
        .eq('user_id', selectedMember)
        .gte('timestamp', since)
        .order('timestamp', { ascending: false })
        .limit(2000);

      if (until) {
        query.lte('timestamp', until);
      }

      const { data, error } = await query;
      if (error) throw error;

      const result = data ?? [];
      setTrail(result);
      onHistoryLoaded(result, 'list');
      if (result.length > 0) setPlaybackIndex(result.length - 1);
    } catch (err: any) {
      console.error('History load error:', err);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
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
  }, [selectedMember, selectedRange, useCustomRange, customFrom, customTo]);

  useEffect(() => {
    return () => { if (playbackTimer) window.clearInterval(playbackTimer); };
  }, [playbackTimer]);

  useEffect(() => {
    if (playbackIndex !== -1 && onPlaybackChange && trail[playbackIndex]) {
      onPlaybackChange(trail[playbackIndex]);
    }
  }, [playbackIndex, trail]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getAddr = (lat: number, lng: number): string => {
    const key = getCacheKey(lat, lng);
    return addresses[key] || t.loadingAddr;
  };

  const getShortAddr = (lat: number, lng: number): string => {
    const full = getAddr(lat, lng);
    if (full === t.loadingAddr) return '...';
    // Take first 2 parts for compact display
    const parts = full.split(',').map(s => s.trim());
    return parts.slice(0, 2).join(', ');
  };

  const isSegmentActive = (seg: TripSegment): boolean =>
    playbackIndex !== -1 && trail[playbackIndex] !== undefined && seg.points.includes(trail[playbackIndex]);

  const toggleDayCollapse = (dateKey: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };

  const currentTimestamp = playbackIndex !== -1 && trail[playbackIndex]
    ? trail[playbackIndex].timestamp
    : null;

  const selectedMemberProfile = members.find(m => m.user_id === selectedMember);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalStats = useMemo(() => {
    let dist = 0, moving = 0, tripC = 0, stayC = 0;
    for (const g of dayGroups) {
      dist += g.totalDistKm;
      moving += g.totalMovingMin;
      tripC += g.tripCount;
      stayC += g.stayCount;
    }
    return { dist, moving, tripC, stayC };
  }, [dayGroups]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Sheet open={true} onOpenChange={(open) => !open && onClose()} modal={false}>
      <SheetContent
        side="right"
        hideOverlay
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="p-0 w-full sm:max-w-[400px] border-l border-border/30 flex flex-col z-[1002] shadow-2xl overflow-hidden bg-background/95 backdrop-blur-xl"
      >
        {/* ── Compact Header ──────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-border/30">
          {/* Title bar */}
          <div className="flex items-center justify-between px-4 pt-5 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <History className="w-4 h-4 text-primary" />
              </div>
              <h3 className="text-base font-bold text-foreground">{t.title}</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Member selector - compact */}
          <div className="px-4 pb-3">
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger className="h-10 bg-muted/50 border-0 rounded-xl text-sm font-semibold">
                <SelectValue placeholder={t.pickMember} />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/40 z-[1003]">
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id} className="rounded-lg py-2">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        m.profile.status === 'online' ? 'bg-emerald-500' :
                        m.profile.status === 'idle' ? 'bg-orange-500' :
                        m.profile.status === 'offline' ? 'bg-purple-500' : 'bg-slate-400'
                      )} />
                      <span className="font-semibold">{m.profile.display_name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time range chips - iSharing style horizontal scroll */}
          <div className="flex items-center gap-1 px-4 pb-3 overflow-x-auto no-scrollbar">
            <button
              onClick={loadHistory}
              disabled={loading}
              className="h-7 w-7 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 hover:bg-muted transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", loading && "animate-spin")} />
            </button>
            {TIME_RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => { setUseCustomRange(false); setSelectedRange(r.value); }}
                className={cn(
                  'h-7 px-3 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-all',
                  selectedRange === r.value && !useCustomRange
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {r.label}
              </button>
            ))}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'h-7 px-3 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-all flex items-center gap-1',
                showFilters
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Filter className="w-3 h-3" />
            </button>
          </div>

          {/* Expandable custom date range */}
          {showFilters && (
            <div className="px-4 pb-3 animate-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 block">{t.fromDate}</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full h-9 bg-muted/50 border-0 rounded-lg px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 block">{t.toDate}</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full h-9 bg-muted/50 border-0 rounded-lg px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <Button
                onClick={() => { setUseCustomRange(true); loadHistory(); }}
                disabled={loading}
                size="sm"
                className="w-full mt-2 h-8 rounded-lg text-xs font-semibold"
              >
                {t.apply}
              </Button>
            </div>
          )}
        </div>

        {/* ── Content ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
              <p className="text-xs font-semibold text-muted-foreground">{t.loading}</p>
            </div>
          ) : trail.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <MapPin className="w-7 h-7 text-muted-foreground/40" />
              </div>
              <h4 className="text-sm font-bold text-foreground mb-1">{t.noData}</h4>
              <p className="text-xs text-muted-foreground max-w-[200px]">{t.noDataDesc}</p>
              <p className="text-[10px] text-primary/60 mt-3 font-medium">{t.suggestRange}</p>
            </div>
          ) : (
            <>
              {/* ── Summary Bar (iSharing style) ─────────────────────────── */}
              <div className="shrink-0 px-4 py-3 border-b border-border/20 bg-muted/30">
                <div className="grid grid-cols-4 gap-2">
                  <SummaryPill icon={<Route className="w-3 h-3" />} value={`${totalStats.dist.toFixed(1)}`} unit="km" />
                  <SummaryPill icon={<Timer className="w-3 h-3" />} value={formatDuration(totalStats.moving)} />
                  <SummaryPill icon={<Navigation className="w-3 h-3" />} value={`${totalStats.tripC}`} unit={t.trips} />
                  <SummaryPill icon={<MapPin className="w-3 h-3" />} value={`${totalStats.stayC}`} unit={t.stops} />
                </div>
              </div>

              {/* ── Trip Timeline ────────────────────────────────────────── */}
              <ScrollArea className="flex-1 min-h-0" ref={scrollAreaRef as any}>
                <div className="pb-36">
                  {dayGroups.map((group) => {
                    const isCollapsed = collapsedDays.has(group.dateKey);

                    return (
                      <div key={group.dateKey}>
                        {/* Day header - clickable to collapse */}
                        <button
                          onClick={() => toggleDayCollapse(group.dateKey)}
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors border-b border-border/15 sticky top-0 z-10"
                        >
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-primary/70" />
                            <span className="text-xs font-bold text-foreground">{group.dateLabel}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {group.totalDistKm.toFixed(1)} km
                            </span>
                            {isCollapsed
                              ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                              : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                            }
                          </div>
                        </button>

                        {/* Segments */}
                        {!isCollapsed && (
                          <div className="relative">
                            {/* Timeline line */}
                            <div className="absolute left-[27px] top-0 bottom-0 w-px bg-border/40 z-0" />

                            {group.segments.map((seg, i) => {
                              const active = isSegmentActive(seg);
                              const isTrip = seg.type === 'trip';
                              const actType = isTrip ? getActivityType(seg.avgSpeed ?? 0) : null;
                              const actConfig = actType ? ACTIVITY_CONFIG[actType] : null;

                              return (
                                <div
                                  key={seg.startTime}
                                  ref={(el) => { segmentRefs.current[seg.startTime] = el; }}
                                  onClick={() => handleSegmentClick(seg)}
                                  className={cn(
                                    'relative flex gap-3 px-4 py-2.5 cursor-pointer transition-all duration-200 group',
                                    active
                                      ? 'bg-primary/8 dark:bg-primary/10'
                                      : 'hover:bg-muted/40'
                                  )}
                                >
                                  {/* Timeline dot */}
                                  <div className="relative z-10 flex items-start pt-0.5 shrink-0 w-[22px]">
                                    <div className={cn(
                                      "w-5 h-5 rounded-full flex items-center justify-center border-2 border-background transition-all",
                                      active
                                        ? (isTrip ? "bg-primary ring-2 ring-primary/20 scale-110" : "bg-orange-500 ring-2 ring-orange-500/20 scale-110")
                                        : (isTrip ? "bg-primary/60" : "bg-orange-400/60")
                                    )}>
                                      {isTrip
                                        ? (actConfig && <actConfig.icon className="w-2.5 h-2.5 text-white" />)
                                        : <CircleDot className="w-2.5 h-2.5 text-white" />
                                      }
                                    </div>
                                  </div>

                                  {/* Content */}
                                  <div className="flex-1 min-w-0">
                                    {isTrip ? (
                                      /* ── Trip Card ─────────────────── */
                                      <div>
                                        {/* Time + Activity + Duration */}
                                        <div className="flex items-center justify-between mb-1.5">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-[11px] font-bold tabular-nums text-foreground">
                                              {format(new Date(seg.startTime), 'HH:mm')}
                                            </span>
                                            <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                                            <span className="text-[11px] font-bold tabular-nums text-foreground">
                                              {format(new Date(seg.endTime), 'HH:mm')}
                                            </span>
                                          </div>
                                          <span className="text-[11px] font-bold text-foreground">
                                            {formatDuration(seg.durationMinutes)}
                                          </span>
                                        </div>

                                        {/* From → To addresses */}
                                        <div className="space-y-1 mb-2">
                                          <div className="flex items-start gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                                            <p className="text-[11px] text-muted-foreground leading-tight line-clamp-1">
                                              {getShortAddr(seg.startLocation.lat, seg.startLocation.lng)}
                                            </p>
                                          </div>
                                          <div className="flex items-start gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                                            <p className="text-[11px] text-muted-foreground leading-tight line-clamp-1">
                                              {getShortAddr(seg.endLocation.lat, seg.endLocation.lng)}
                                            </p>
                                          </div>
                                        </div>

                                        {/* Stats row */}
                                        <div className="flex items-center gap-3">
                                          {actConfig && (
                                            <span className={cn(
                                              "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded",
                                              actConfig.bg, actConfig.text
                                            )}>
                                              <actConfig.icon className="w-3 h-3" />
                                              {actConfig.label[language]}
                                            </span>
                                          )}
                                          <span className="text-[10px] font-medium text-muted-foreground">
                                            {formatDist(seg.distance ?? 0)}
                                          </span>
                                          <span className="text-[10px] font-medium text-muted-foreground">
                                            ⌀ {Math.round(seg.avgSpeed ?? 0)} {t.speed}
                                          </span>
                                        </div>
                                      </div>
                                    ) : (
                                      /* ── Stay Card - Compact single line ── */
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-[11px] font-bold tabular-nums text-muted-foreground shrink-0">
                                            {format(new Date(seg.startTime), 'HH:mm')}
                                          </span>
                                          <p className="text-[11px] text-foreground/80 truncate">
                                            {getShortAddr(seg.startLocation.lat, seg.startLocation.lng)}
                                          </p>
                                        </div>
                                        <span className="text-[10px] font-semibold text-orange-500/80 shrink-0 ml-2">
                                          {formatDuration(seg.durationMinutes)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* ── Playback Bar (iSharing Dynamic Island style) ────────── */}
              {trail.length > 0 && !loading && (
                <div className="absolute bottom-6 left-4 right-4 z-40 animate-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-foreground/95 dark:bg-background/95 backdrop-blur-xl rounded-2xl p-3 shadow-[0_16px_48px_rgba(0,0,0,0.2)] border border-white/5">
                    {/* Slider */}
                    <input
                      type="range"
                      min="0"
                      max={trail.length - 1}
                      value={playbackIndex === -1 ? trail.length - 1 : playbackIndex}
                      onChange={(e) => handleSeek(parseInt(e.target.value))}
                      className="w-full h-1 rounded-full appearance-none cursor-pointer mb-2.5 playback-slider"
                      dir="rtl"
                    />

                    {/* Controls row */}
                    <div className="flex items-center justify-between">
                      {/* Time display */}
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold tabular-nums text-background dark:text-foreground">
                          {currentTimestamp ? format(new Date(currentTimestamp), 'HH:mm:ss') : '--:--'}
                        </span>
                        <span className="text-[9px] font-medium text-background/50 dark:text-foreground/50">
                          {currentTimestamp ? format(new Date(currentTimestamp), 'dd/MM/yyyy') : ''}
                        </span>
                      </div>

                      {/* Play controls */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={togglePlayback}
                          className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90",
                            isPlaying
                              ? "bg-primary text-white"
                              : "bg-background/20 dark:bg-white/10 text-background dark:text-foreground"
                          )}
                        >
                          {isPlaying
                            ? <Pause className="w-4 h-4" />
                            : <Play className="w-4 h-4 ml-0.5" />
                          }
                        </button>

                        <button
                          onClick={nextPlaybackSpeed}
                          className="h-7 px-2 rounded-lg bg-background/15 dark:bg-white/10 text-[10px] font-bold text-background dark:text-foreground transition-all active:scale-95"
                        >
                          {playbackSpeed}×
                        </button>
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
          .playback-slider { -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.15); }
          .playback-slider::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none;
            width: 14px; height: 14px; background: #3B82F6; border-radius: 7px;
            border: 2px solid #FFFFFF; cursor: pointer;
            transition: all 0.15s ease;
          }
          .playback-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
          .playback-slider::-moz-range-thumb {
            width: 14px; height: 14px; background: #3B82F6; border-radius: 7px;
            border: 2px solid #FFFFFF; cursor: pointer;
          }
        `}} />
      </SheetContent>
    </Sheet>
  );
}

// ─── Summary Pill ─────────────────────────────────────────────────────────────

function SummaryPill({ icon, value, unit }: { icon: React.ReactNode; value: string; unit?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 p-2 rounded-xl bg-background/60 border border-border/20">
      <div className="text-muted-foreground/60">{icon}</div>
      <span className="text-sm font-bold text-foreground tabular-nums leading-none">{value}</span>
      {unit && <span className="text-[9px] font-medium text-muted-foreground leading-none">{unit}</span>}
    </div>
  );
}
