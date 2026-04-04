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
  PauseCircle, PlayCircle, Filter, TrendingUp,
  Home, Building2, GraduationCap, Stethoscope,
  UtensilsCrossed, Coffee, ShoppingCart, TreePine,
  Dumbbell, Fuel, ParkingSquare, Church, Hotel,
  Film, Pin, MoreHorizontal, Eye, EyeOff,
  ChevronLeft, ArrowDown, MoveRight
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { vi as viLocale, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getServerNow } from '@/lib/time';
import { detectTrips, TripSegment, getActivityType, calcSpeedKmh } from '@/lib/tripUtils';
import {
  batchReverseGeocodeStructured,
  getCacheKey,
  GeocodedAddress,
  CATEGORY_CONFIG,
  PlaceCategory
} from '@/lib/geocoding';
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
    loading: 'Đang tải dữ liệu vị trí...',
    loadingAddr: 'Đang tải địa chỉ...',
    today: 'Hôm nay',
    yesterday: 'Hôm qua',
    totalDist: 'Tổng quãng đường',
    movingTime: 'Thời gian di chuyển',
    trips: 'chuyến',
    stops: 'điểm dừng',
    speed: 'km/h',
    custom: 'Tuỳ chỉnh',
    apply: 'Áp dụng',
    fromDate: 'Từ ngày',
    toDate: 'Đến ngày',
    allDay: 'Cả ngày',
    filters: 'Bộ lọc',
    arrived: 'Đến',
    departed: 'Rời đi',
    duration: 'Thời gian',
    from: 'Từ',
    to: 'Đến',
    via: 'qua',
    points: 'điểm',
    showDetails: 'Chi tiết',
    hideDetails: 'Ẩn',
    stayedFor: 'Dừng',
    traveledVia: 'Di chuyển bằng',
    noAddress: 'Đang xác định...',
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
    loading: 'Loading location data...',
    loadingAddr: 'Loading address...',
    today: 'Today',
    yesterday: 'Yesterday',
    totalDist: 'Total distance',
    movingTime: 'Moving time',
    trips: 'trips',
    stops: 'stops',
    speed: 'km/h',
    custom: 'Custom',
    apply: 'Apply',
    fromDate: 'From',
    toDate: 'To',
    allDay: 'All Day',
    filters: 'Filters',
    arrived: 'Arrived',
    departed: 'Left',
    duration: 'Duration',
    from: 'From',
    to: 'To',
    via: 'via',
    points: 'points',
    showDetails: 'Details',
    hideDetails: 'Hide',
    stayedFor: 'Stopped',
    traveledVia: 'Traveled by',
    noAddress: 'Locating...',
  },
};

// ─── Activity config (iSharing palette) ───────────────────────────────────────

const ACTIVITY_CONFIG = {
  driving: {
    icon: Car,
    color: '#3B82F6',
    bg: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    label: { vi: 'Lái xe', en: 'Driving' },
  },
  cycling: {
    icon: Bike,
    color: '#10B981',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    label: { vi: 'Đạp xe', en: 'Cycling' },
  },
  walking: {
    icon: Footprints,
    color: '#F59E0B',
    bg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    label: { vi: 'Đi bộ', en: 'Walking' },
  },
} as const;

// ─── Category icons ───────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<PlaceCategory, React.ComponentType<any>> = {
  home: Home, work: Building2, school: GraduationCap, hospital: Stethoscope,
  restaurant: UtensilsCrossed, cafe: Coffee, shop: ShoppingCart, park: TreePine,
  gym: Dumbbell, gas_station: Fuel, parking: ParkingSquare, worship: Church,
  hotel: Hotel, entertainment: Film, other: Pin,
};

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
  if (min < 60) return `${Math.round(min)}p`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h${m}p` : `${h}h`;
}

function formatDist(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function LocationHistory({
  members, onHistoryLoaded, onClose, onPlaybackChange, initialMemberId,
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
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [isPlaybackMinimized, setIsPlaybackMinimized] = useState(false);

  const [addresses, setAddresses] = useState<Record<string, GeocodedAddress>>({});
  const segmentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const trips = useMemo(() => detectTrips(trail), [trail]);
  const dayGroups = useMemo(() => buildDayGroups(trips, language), [trips, language]);

  // Sorted trail (chronological, oldest first) for proper playback
  const sortedTrail = useMemo(() =>
    [...trail].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [trail]
  );

  // ── Geocode ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const allPoints = trips.flatMap((s) =>
      s.type === 'trip'
        ? [s.startLocation, s.endLocation]
        : [s.startLocation]
    );
    if (allPoints.length === 0) return;
    batchReverseGeocodeStructured(allPoints, (key, address) => {
      setAddresses((prev) => {
        if (prev[key]?.full === address.full) return prev;
        return { ...prev, [key]: address };
      });
    });
  }, [trips]);

  // ── Auto-scroll to active segment ───────────────────────────────────────────
  useEffect(() => {
    if (playbackIndex === -1) return;
    const currentPoint = sortedTrail[playbackIndex];
    if (!currentPoint) return;
    const activeSeg = trips.find((seg) => seg.points.includes(currentPoint));
    if (activeSeg) {
      segmentRefs.current[activeSeg.startTime]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [playbackIndex, sortedTrail, trips]);

  // ── Playback (now uses chronological order, slider goes left→right) ─────────
  const stopPlayback = useCallback(() => {
    if (playbackTimer) window.clearInterval(playbackTimer);
    setPlaybackTimer(null);
    setIsPlaying(false);
  }, [playbackTimer]);

  const startPlayback = useCallback(
    (speed: number) => {
      if (playbackTimer) window.clearInterval(playbackTimer);
      const startIdx = playbackIndex <= 0 ? 0 : playbackIndex;
      setPlaybackIndex(startIdx);
      setIsPlaying(true);
      const timer = window.setInterval(() => {
        setPlaybackIndex((prev) => {
          if (prev >= sortedTrail.length - 1) {
            window.clearInterval(timer);
            setIsPlaying(false);
            return sortedTrail.length - 1;
          }
          return prev + 1;
        });
      }, 400 / speed);
      setPlaybackTimer(timer);
    },
    [playbackIndex, playbackTimer, sortedTrail.length]
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
    if (onPlaybackChange && sortedTrail[index]) onPlaybackChange(sortedTrail[index]);
  };

  const handleSegmentClick = (seg: TripSegment) => {
    if (activeSegmentId === seg.startTime) {
      setActiveSegmentId(null);
      onHistoryLoaded(trail, 'list');
      return;
    }
    setActiveSegmentId(seg.startTime);
    // Find this segment's first point in sortedTrail
    const firstPoint = seg.points[0];
    const idx = sortedTrail.indexOf(firstPoint);
    if (idx !== -1) handleSeek(idx);
    onHistoryLoaded(seg.points, 'map');
  };

  useEffect(() => {
    if (playbackIndex !== -1 && onPlaybackChange && sortedTrail[playbackIndex]) {
      onPlaybackChange(sortedTrail[playbackIndex]);
    }
  }, [playbackIndex, sortedTrail]);

  useEffect(() => {
    return () => { if (playbackTimer) window.clearInterval(playbackTimer); };
  }, [playbackTimer]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!selectedMember) return;
    setLoading(true);
    stopPlayback();
    setPlaybackIndex(-1);
    setActiveSegmentId(null);

    try {
      let since: string;
      let until: string | undefined;

      if (useCustomRange) {
        since = new Date(`${customFrom}T00:00:00`).toISOString();
        until = new Date(`${customTo}T23:59:59`).toISOString();
      } else {
        const range = TIME_RANGES.find((r) => r.value === selectedRange);
        since = new Date(getServerNow().getTime() - (range?.hours ?? 3) * 60 * 60 * 1000).toISOString();
      }

      const query = supabase
        .from('user_locations')
        .select('*')
        .eq('user_id', selectedMember)
        .gte('timestamp', since)
        .order('timestamp', { ascending: false })
        .limit(2000);

      if (until) query.lte('timestamp', until);

      const { data, error } = await query;
      if (error) throw error;

      const result = (data ?? []).filter(loc => loc.accuracy === null || loc.accuracy <= 300);
      setTrail(result);
      onHistoryLoaded(result, 'list');
      if (result.length > 0) setPlaybackIndex(0);
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getAddr = (lat: number, lng: number): GeocodedAddress | null => {
    return addresses[getCacheKey(lat, lng)] || null;
  };

  const getAddrFull = (lat: number, lng: number): string => {
    return getAddr(lat, lng)?.full || t.noAddress;
  };

  const getAddrShort = (lat: number, lng: number): string => {
    return getAddr(lat, lng)?.short || '...';
  };

  const getCategory = (lat: number, lng: number): PlaceCategory => {
    return getAddr(lat, lng)?.category || 'other';
  };

  const isSegmentActive = (seg: TripSegment): boolean => {
    if (playbackIndex === -1) return false;
    const currentPoint = sortedTrail[playbackIndex];
    return currentPoint !== undefined && seg.points.includes(currentPoint);
  };

  const toggleDayCollapse = (dateKey: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey); else next.add(dateKey);
      return next;
    });
  };

  // Current playback speed calculation
  const currentSpeed = useMemo(() => {
    if (playbackIndex <= 0 || playbackIndex >= sortedTrail.length) return 0;
    return calcSpeedKmh(sortedTrail[playbackIndex - 1], sortedTrail[playbackIndex]);
  }, [playbackIndex, sortedTrail]);

  const currentTimestamp = playbackIndex !== -1 && sortedTrail[playbackIndex]
    ? sortedTrail[playbackIndex].timestamp : null;

  const selectedMemberProfile = members.find(m => m.user_id === selectedMember);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalStats = useMemo(() => {
    let dist = 0, moving = 0, tripC = 0, stayC = 0, maxSpd = 0;
    for (const g of dayGroups) {
      dist += g.totalDistKm;
      moving += g.totalMovingMin;
      tripC += g.tripCount;
      stayC += g.stayCount;
    }
    for (const seg of trips) {
      if (seg.type === 'trip' && (seg.maxSpeed ?? 0) > maxSpd) maxSpd = seg.maxSpeed ?? 0;
    }
    return { dist, moving, tripC, stayC, maxSpd };
  }, [dayGroups, trips]);

  // ═════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════════
  return (
    <Sheet open={true} onOpenChange={(open) => !open && onClose()} modal={false}>
      <SheetContent
        side="right"
        hideOverlay
        hideCloseButton
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="p-0 w-full sm:max-w-[420px] border-l border-border/20 flex flex-col z-[1002] shadow-2xl overflow-hidden bg-background/98 backdrop-blur-2xl"
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="shrink-0">
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/10">
                <History className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground leading-tight">{t.title}</h3>
                {selectedMemberProfile && (
                  <p className="text-[10px] font-medium text-muted-foreground mt-0.5">
                    {selectedMemberProfile.profile.display_name}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Member selector */}
          <div className="px-5 pb-2.5">
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger className="h-10 bg-muted/40 border-0 rounded-xl text-sm font-semibold shadow-sm">
                <SelectValue placeholder={t.pickMember} />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/30 z-[1003]">
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id} className="rounded-lg py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        "w-2.5 h-2.5 rounded-full ring-2 ring-offset-1 ring-offset-background",
                        m.profile.status === 'online' ? 'bg-emerald-500 ring-emerald-500/30' :
                        m.profile.status === 'idle' ? 'bg-orange-500 ring-orange-500/30' :
                        'bg-slate-400 ring-slate-400/30'
                      )} />
                      <span className="font-semibold">{m.profile.display_name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time chips */}
          <div className="flex items-center gap-1.5 px-5 pb-3 overflow-x-auto no-scrollbar">
            <button
              onClick={loadHistory}
              disabled={loading}
              className="h-8 w-8 rounded-xl bg-muted/40 flex items-center justify-center shrink-0 hover:bg-muted/70 transition-all active:scale-95 shadow-sm"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", loading && "animate-spin")} />
            </button>
            {TIME_RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => { setUseCustomRange(false); setSelectedRange(r.value); }}
                className={cn(
                  'h-8 px-3.5 text-xs font-bold rounded-xl whitespace-nowrap shrink-0 transition-all duration-200 active:scale-95 shadow-sm',
                  selectedRange === r.value && !useCustomRange
                    ? 'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-primary/20 shadow-md'
                    : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
                )}
              >
                {r.label}
              </button>
            ))}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'h-8 px-3 text-xs font-bold rounded-xl whitespace-nowrap shrink-0 transition-all duration-200 flex items-center gap-1.5 active:scale-95 shadow-sm',
                showFilters
                  ? 'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-primary/20 shadow-md'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
              )}
            >
              <Filter className="w-3 h-3" />
            </button>
          </div>

          {/* Custom date */}
          {showFilters && (
            <div className="px-5 pb-3 animate-in slide-in-from-top-2 duration-200">
              <div className="bg-muted/30 rounded-xl p-3 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">{t.fromDate}</label>
                    <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full h-9 bg-background/80 border border-border/30 rounded-lg px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">{t.toDate}</label>
                    <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full h-9 bg-background/80 border border-border/30 rounded-lg px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </div>
                <Button onClick={() => { setUseCustomRange(true); loadHistory(); }} disabled={loading}
                  size="sm" className="w-full h-8 rounded-lg text-xs font-bold">
                  {t.apply}
                </Button>
              </div>
            </div>
          )}

          <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
        </div>

        {/* ── Content ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-[3px] border-primary/15 border-t-primary animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-primary/50" />
                </div>
              </div>
              <p className="text-xs font-semibold text-muted-foreground">{t.loading}</p>
            </div>
          ) : trail.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center mb-5 ring-1 ring-border/10">
                <MapPin className="w-8 h-8 text-muted-foreground/30" />
              </div>
              <h4 className="text-sm font-bold text-foreground mb-1.5">{t.noData}</h4>
              <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed">{t.noDataDesc}</p>
              <p className="text-[10px] text-primary/60 mt-4 font-semibold">{t.suggestRange}</p>
            </div>
          ) : (
            <>
              {/* ── Summary Cards (iSharing style) ──────────────────────── */}
              <SummaryCards stats={totalStats} t={t} />

              {/* ── Timeline ─────────────────────────────────────────────── */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="pb-36">
                  {dayGroups.map((group) => (
                    <DaySection
                      key={group.dateKey}
                      group={group}
                      isCollapsed={collapsedDays.has(group.dateKey)}
                      onToggle={() => toggleDayCollapse(group.dateKey)}
                      activeSegmentId={activeSegmentId}
                      isSegmentActive={isSegmentActive}
                      onSegmentClick={handleSegmentClick}
                      getAddrShort={getAddrShort}
                      getAddrFull={getAddrFull}
                      getCategory={getCategory}
                      getAddr={getAddr}
                      language={language}
                      t={t}
                      segmentRefs={segmentRefs}
                    />
                  ))}
                </div>
              </ScrollArea>

              {/* ── Playback Bar ──────────────────────────────────────────── */}
              <PlaybackBar
                trail={sortedTrail}
                playbackIndex={playbackIndex}
                isPlaying={isPlaying}
                playbackSpeed={playbackSpeed}
                currentSpeed={currentSpeed}
                currentTimestamp={currentTimestamp}
                isMinimized={isPlaybackMinimized}
                onSeek={handleSeek}
                onTogglePlay={togglePlayback}
                onNextSpeed={nextPlaybackSpeed}
                onMinimize={() => setIsPlaybackMinimized(true)}
                onRestore={() => setIsPlaybackMinimized(false)}
                loading={loading}
                t={t}
              />
            </>
          )}
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          .no-scrollbar::-webkit-scrollbar { display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          .playback-slider { -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.12); }
          .playback-slider::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none;
            width: 16px; height: 16px; background: #3B82F6; border-radius: 8px;
            border: 2.5px solid #FFFFFF; cursor: pointer;
            transition: all 0.15s ease;
            box-shadow: 0 2px 6px rgba(59, 130, 246, 0.3);
          }
          .playback-slider::-webkit-slider-thumb:hover { transform: scale(1.25); }
          .playback-slider::-moz-range-thumb {
            width: 16px; height: 16px; background: #3B82F6; border-radius: 8px;
            border: 2.5px solid #FFFFFF; cursor: pointer;
          }
        `}} />
      </SheetContent>
    </Sheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCards({ stats, t }: { stats: { dist: number; moving: number; tripC: number; stayC: number; maxSpd: number }; t: typeof TEXT['vi'] }) {
  return (
    <div className="shrink-0 px-4 py-3 bg-gradient-to-b from-muted/25 to-transparent">
      {/* Main stats */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-background/70 rounded-xl p-3 border border-border/15 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <Route className="w-3.5 h-3.5 text-primary/70" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{t.totalDist}</span>
          </div>
          <span className="text-lg font-black text-foreground tabular-nums">
            {stats.dist >= 100 ? Math.round(stats.dist) : stats.dist.toFixed(1)} <span className="text-[10px] font-bold text-muted-foreground">km</span>
          </span>
        </div>
        <div className="flex-1 bg-background/70 rounded-xl p-3 border border-border/15 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <Timer className="w-3.5 h-3.5 text-primary/70" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{t.movingTime}</span>
          </div>
          <span className="text-lg font-black text-foreground tabular-nums">
            {formatDuration(stats.moving)}
          </span>
        </div>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 mt-2">
        <div className="flex items-center gap-1.5 bg-primary/8 rounded-lg px-2.5 py-1">
          <Navigation className="w-3 h-3 text-primary" />
          <span className="text-[10px] font-bold text-primary">{stats.tripC} {t.trips}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-orange-500/8 rounded-lg px-2.5 py-1">
          <MapPin className="w-3 h-3 text-orange-500" />
          <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400">{stats.stayC} {t.stops}</span>
        </div>
        {stats.maxSpd > 0 && (
          <div className="flex items-center gap-1.5 bg-red-500/8 rounded-lg px-2.5 py-1 ml-auto">
            <Gauge className="w-3 h-3 text-red-500" />
            <span className="text-[10px] font-bold text-red-600 dark:text-red-400">{Math.round(stats.maxSpd)} {t.speed}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Day Section ───────────────────────────────────────────────────────────────

function DaySection({
  group, isCollapsed, onToggle, activeSegmentId, isSegmentActive,
  onSegmentClick, getAddrShort, getAddrFull, getCategory, getAddr,
  language, t, segmentRefs,
}: {
  group: DayGroup;
  isCollapsed: boolean;
  onToggle: () => void;
  activeSegmentId: string | null;
  isSegmentActive: (seg: TripSegment) => boolean;
  onSegmentClick: (seg: TripSegment) => void;
  getAddrShort: (lat: number, lng: number) => string;
  getAddrFull: (lat: number, lng: number) => string;
  getCategory: (lat: number, lng: number) => PlaceCategory;
  getAddr: (lat: number, lng: number) => GeocodedAddress | null;
  language: 'vi' | 'en';
  t: typeof TEXT['vi'];
  segmentRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
  return (
    <div>
      {/* Day header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-2.5 bg-muted/25 hover:bg-muted/40 transition-colors sticky top-0 z-10 border-b border-border/10"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calendar className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="text-left">
            <span className="text-[13px] font-bold text-foreground block leading-tight">{group.dateLabel}</span>
            <span className="text-[10px] font-medium text-muted-foreground">
              {group.tripCount} {t.trips} · {group.stayCount} {t.stops}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-primary tabular-nums">
            {group.totalDistKm.toFixed(1)} km
          </span>
          <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-200", !isCollapsed && "rotate-90")} />
        </div>
      </button>

      {/* Segments */}
      {!isCollapsed && (
        <div className="relative pl-2">
          {group.segments.map((seg, i) => {
            const active = isSegmentActive(seg) || activeSegmentId === seg.startTime;
            const isLast = i === group.segments.length - 1;

            return seg.type === 'trip' ? (
              <TripCard
                key={seg.startTime}
                seg={seg}
                active={active}
                isLast={isLast}
                onSegmentClick={onSegmentClick}
                getAddrShort={getAddrShort}
                language={language}
                t={t}
                segmentRefs={segmentRefs}
              />
            ) : (
              <StayCard
                key={seg.startTime}
                seg={seg}
                active={active}
                isFirst={i === 0}
                isLast={isLast}
                onSegmentClick={onSegmentClick}
                getAddrFull={getAddrFull}
                getCategory={getCategory}
                getAddr={getAddr}
                language={language}
                t={t}
                segmentRefs={segmentRefs}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Trip Card (iSharing style: compact connector between stays) ───────────────

function TripCard({
  seg, active, isLast, onSegmentClick, getAddrShort, language, t, segmentRefs,
}: {
  seg: TripSegment;
  active: boolean;
  isLast: boolean;
  onSegmentClick: (seg: TripSegment) => void;
  getAddrShort: (lat: number, lng: number) => string;
  language: 'vi' | 'en';
  t: typeof TEXT['vi'];
  segmentRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
  const actType = getActivityType(seg.avgSpeed ?? 0);
  const actConfig = ACTIVITY_CONFIG[actType];
  const ActIcon = actConfig.icon;

  return (
    <div
      ref={(el) => { segmentRefs.current[seg.startTime] = el; }}
      className={cn("flex transition-all duration-200", active ? "bg-primary/5" : "")}
    >
      {/* Timeline column */}
      <div className="w-12 shrink-0 flex flex-col items-center">
        <div className="w-0.5 h-3 bg-border/20" />
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 transition-all",
            active
              ? "border-primary bg-primary/10 scale-110 shadow-sm shadow-primary/20"
              : "border-border/30 bg-muted/30"
          )}
          style={{ borderColor: active ? actConfig.color : undefined }}
        >
          <ActIcon className="w-3.5 h-3.5" style={{ color: actConfig.color }} />
        </div>
        <div className={cn("w-0.5 flex-1", isLast ? "bg-transparent" : "bg-border/20")} />
      </div>

      {/* Content */}
      <div
        className="flex-1 pr-4 py-2 cursor-pointer group"
        onClick={() => onSegmentClick(seg)}
      >
        <div className={cn(
          "rounded-xl border p-2.5 transition-all duration-200",
          active
            ? "border-primary/30 bg-primary/5 shadow-sm"
            : "border-border/10 bg-muted/15 hover:bg-muted/30 hover:border-border/25"
        )}>
          {/* Header: activity + time */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md", actConfig.bg, actConfig.text)}>
                {actConfig.label[language]}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {format(new Date(seg.startTime), 'HH:mm')} → {format(new Date(seg.endTime), 'HH:mm')}
              </span>
            </div>
            <span className="text-[10px] font-bold text-foreground/70 tabular-nums">
              {formatDuration(seg.durationMinutes)}
            </span>
          </div>

          {/* Route: From → To */}
          <div className="relative pl-3.5 space-y-0.5 mb-2">
            <div className="absolute left-[3px] top-[5px] bottom-[5px] w-0.5 bg-gradient-to-b from-emerald-500/60 to-red-500/60 rounded-full" />
            <div className="flex items-center gap-1.5 relative">
              <div className="absolute -left-3.5 top-[4px] w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <p className="text-[11px] text-foreground/70 leading-snug line-clamp-1">
                {getAddrShort(seg.startLocation.lat, seg.startLocation.lng)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 relative">
              <div className="absolute -left-3.5 top-[4px] w-1.5 h-1.5 rounded-full bg-red-500" />
              <p className="text-[11px] text-foreground/70 leading-snug line-clamp-1">
                {getAddrShort(seg.endLocation.lat, seg.endLocation.lng)}
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
              <Route className="w-2.5 h-2.5" />
              {formatDist(seg.distance ?? 0)}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
              <Gauge className="w-2.5 h-2.5" />
              ⌀{Math.round(seg.avgSpeed ?? 0)}
            </span>
            {(seg.maxSpeed ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                <TrendingUp className="w-2.5 h-2.5" />
                ↑{Math.round(seg.maxSpeed ?? 0)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stay Card (iSharing style: place-centric with icon + address) ─────────────

function StayCard({
  seg, active, isFirst, isLast, onSegmentClick, getAddrFull, getCategory, getAddr,
  language, t, segmentRefs,
}: {
  seg: TripSegment;
  active: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSegmentClick: (seg: TripSegment) => void;
  getAddrFull: (lat: number, lng: number) => string;
  getCategory: (lat: number, lng: number) => PlaceCategory;
  getAddr: (lat: number, lng: number) => GeocodedAddress | null;
  language: 'vi' | 'en';
  t: typeof TEXT['vi'];
  segmentRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
  const category = getCategory(seg.startLocation.lat, seg.startLocation.lng);
  const catConfig = CATEGORY_CONFIG[category];
  const CatIcon = CATEGORY_ICONS[category];
  const addr = getAddr(seg.startLocation.lat, seg.startLocation.lng);

  return (
    <div
      ref={(el) => { segmentRefs.current[seg.startTime] = el; }}
      onClick={() => onSegmentClick(seg)}
      className={cn(
        'flex cursor-pointer transition-all duration-200 group',
        active ? 'bg-orange-500/5' : 'hover:bg-muted/20'
      )}
    >
      {/* Timeline column */}
      <div className="w-12 shrink-0 flex flex-col items-center py-3">
        {!isFirst && <div className="w-0.5 h-1 bg-border/20" />}
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all shrink-0",
          active
            ? "border-orange-500 bg-orange-500/10 scale-105 shadow-sm shadow-orange-500/15"
            : "border-border/25 bg-background group-hover:border-border/40"
        )}>
          <CatIcon className="w-4.5 h-4.5" style={{ color: catConfig.color }} />
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-border/20 mt-px" />}
      </div>

      {/* Content */}
      <div className="flex-1 pr-4 py-3 min-w-0">
        {/* Time range + duration */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-bold tabular-nums text-foreground">
            {format(new Date(seg.startTime), 'HH:mm')}
            <span className="text-muted-foreground/40 mx-1">—</span>
            {format(new Date(seg.endTime), 'HH:mm')}
          </span>
          <div className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold",
            seg.durationMinutes >= 60
              ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
              : "bg-muted/50 text-muted-foreground"
          )}>
            <Clock className="w-2.5 h-2.5" />
            {formatDuration(seg.durationMinutes)}
          </div>
        </div>

        {/* Address */}
        <p className={cn(
          "text-[12px] font-medium leading-snug line-clamp-2",
          active ? "text-foreground" : "text-foreground/80"
        )}>
          {getAddrFull(seg.startLocation.lat, seg.startLocation.lng)}
        </p>

        {/* Category + house number */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {category !== 'other' && (
            <div className="flex items-center gap-1">
              <span className="text-xs">{catConfig.emoji}</span>
              <span className="text-[10px] font-semibold" style={{ color: catConfig.color }}>
                {catConfig.label[language]}
              </span>
            </div>
          )}
          {addr?.houseNumber && addr?.road && (
            <div className="flex items-center gap-1 bg-blue-500/8 rounded px-1.5 py-0.5">
              <Home className="w-2.5 h-2.5 text-blue-500" />
              <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400">
                {addr.houseNumber} {addr.road}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Playback Bar ──────────────────────────────────────────────────────────────

function PlaybackBar({
  trail, playbackIndex, isPlaying, playbackSpeed, currentSpeed, currentTimestamp,
  isMinimized, onSeek, onTogglePlay, onNextSpeed, onMinimize, onRestore, loading, t,
}: {
  trail: Tables<'user_locations'>[];
  playbackIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  currentSpeed: number;
  currentTimestamp: string | null;
  isMinimized: boolean;
  onSeek: (index: number) => void;
  onTogglePlay: () => void;
  onNextSpeed: () => void;
  onMinimize: () => void;
  onRestore: () => void;
  loading: boolean;
  t: typeof TEXT['vi'];
}) {
  if (trail.length === 0 || loading) return null;

  return (
    <>
      {/* Main bar */}
      <div className={cn(
        "absolute left-4 right-4 z-40 transition-all duration-500 ease-in-out",
        isMinimized ? "bottom-[-100px] opacity-0 pointer-events-none" : "bottom-6 opacity-100"
      )}>
        <div className="bg-foreground/95 dark:bg-background/95 backdrop-blur-xl rounded-2xl p-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.25)] border border-white/5 relative">
          {/* Minimize button */}
          <button
            onClick={onMinimize}
            className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-6 bg-foreground/95 dark:bg-background/95 border border-white/5 rounded-t-lg flex items-center justify-center cursor-pointer hover:bg-foreground dark:hover:bg-background transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5 text-background/70 dark:text-foreground/70" />
          </button>

          {/* Slider (LTR — natural left-to-right chronological) */}
          <input
            type="range"
            min="0"
            max={trail.length - 1}
            value={playbackIndex === -1 ? 0 : playbackIndex}
            onChange={(e) => onSeek(parseInt(e.target.value))}
            className="w-full h-1 rounded-full appearance-none cursor-pointer mb-3 playback-slider"
          />

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[12px] font-black tabular-nums text-background dark:text-foreground">
                {currentTimestamp ? format(new Date(currentTimestamp), 'HH:mm:ss') : '--:--'}
              </span>
              <span className="text-[9px] font-semibold text-background/50 dark:text-foreground/50 tabular-nums">
                {currentTimestamp ? format(new Date(currentTimestamp), 'dd/MM/yyyy') : ''}
              </span>
            </div>

            {/* Calculated speed indicator */}
            <div className="flex items-center gap-1 bg-background/15 dark:bg-white/10 rounded-lg px-2 py-1">
              <Gauge className="w-3 h-3 text-background/60 dark:text-foreground/60" />
              <span className="text-[10px] font-bold tabular-nums text-background/80 dark:text-foreground/80">
                {Math.round(currentSpeed)} {t.speed}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={onTogglePlay}
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90",
                  isPlaying
                    ? "bg-primary text-white shadow-lg shadow-primary/30"
                    : "bg-background/20 dark:bg-white/10 text-background dark:text-foreground hover:bg-background/30 dark:hover:bg-white/15"
                )}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <button
                onClick={onNextSpeed}
                className="h-8 px-2.5 rounded-lg bg-background/15 dark:bg-white/10 text-[10px] font-black text-background dark:text-foreground transition-all active:scale-95 hover:bg-background/25 dark:hover:bg-white/15 tabular-nums"
              >
                {playbackSpeed}×
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating restore button */}
      <button
        onClick={onRestore}
        className={cn(
          "absolute right-4 bottom-6 w-12 h-12 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.2)] bg-foreground/95 dark:bg-background/95 backdrop-blur-xl border border-white/5 flex items-center justify-center text-background dark:text-foreground transition-all duration-300 z-50",
          isMinimized ? "scale-100 opacity-100 translate-y-0" : "scale-50 opacity-0 translate-y-8 pointer-events-none"
        )}
      >
        <PlayCircle className="w-6 h-6" />
      </button>
    </>
  );
}
