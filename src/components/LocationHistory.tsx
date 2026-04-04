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
  ChevronLeft
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { vi as viLocale, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getServerNow } from '@/lib/time';
import { detectTrips, TripSegment, getActivityType, getActivityLabel } from '@/lib/tripUtils';
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

// ─── Activity config ──────────────────────────────────────────────────────────

const ACTIVITY_CONFIG = {
  driving: {
    icon: Car,
    color: '#3B82F6',
    gradient: 'from-blue-500 to-blue-600',
    bg: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    label: { vi: 'Lái xe', en: 'Driving' },
    lineColor: '#3B82F6',
  },
  cycling: {
    icon: Bike,
    color: '#10B981',
    gradient: 'from-emerald-500 to-emerald-600',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    label: { vi: 'Đạp xe', en: 'Cycling' },
    lineColor: '#10B981',
  },
  walking: {
    icon: Footprints,
    color: '#F59E0B',
    gradient: 'from-amber-500 to-amber-600',
    bg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    label: { vi: 'Đi bộ', en: 'Walking' },
    lineColor: '#F59E0B',
  },
} as const;

// ─── Place category icons ─────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<PlaceCategory, React.ComponentType<any>> = {
  home: Home,
  work: Building2,
  school: GraduationCap,
  hospital: Stethoscope,
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  shop: ShoppingCart,
  park: TreePine,
  gym: Dumbbell,
  gas_station: Fuel,
  parking: ParkingSquare,
  worship: Church,
  hotel: Hotel,
  entertainment: Film,
  other: Pin,
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
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function formatDist(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatDistShort(km: number): string {
  if (km >= 100) return `${Math.round(km)}`;
  if (km >= 10) return km.toFixed(1);
  return km.toFixed(1);
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
  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(new Set());
  const [isPlaybackMinimized, setIsPlaybackMinimized] = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  // Structured address cache
  const [addresses, setAddresses] = useState<Record<string, GeocodedAddress>>({});
  const segmentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const trips = useMemo(() => detectTrips(trail), [trail]);
  const dayGroups = useMemo(() => buildDayGroups(trips, language), [trips, language]);

  // ── Geocode all points (structured) ─────────────────────────────────────────
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
    if (activeSegmentId === seg.startTime) {
      // Unselect if clicked again
      setActiveSegmentId(null);
      onHistoryLoaded(trail, 'list');
      return;
    }

    // Select this specific trip
    setActiveSegmentId(seg.startTime);
    // Move playback to the start of this trip (latest index in the reversed array)
    const tripStartPoint = seg.points[seg.points.length - 1];
    const idx = trail.indexOf(tripStartPoint);
    if (idx !== -1) handleSeek(idx);
    
    // Tell the map to only show lines for this segment
    onHistoryLoaded(seg.points, 'map');
  };

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

      const result = (data ?? []).filter(loc => loc.accuracy === null || loc.accuracy <= 300);
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
  const getAddr = (lat: number, lng: number): GeocodedAddress | null => {
    const key = getCacheKey(lat, lng);
    return addresses[key] || null;
  };

  const getAddrFull = (lat: number, lng: number): string => {
    const addr = getAddr(lat, lng);
    return addr?.full || t.noAddress;
  };

  const getAddrShort = (lat: number, lng: number): string => {
    const addr = getAddr(lat, lng);
    if (!addr) return '...';
    return addr.short;
  };

  const getCategory = (lat: number, lng: number): PlaceCategory => {
    const addr = getAddr(lat, lng);
    return addr?.category || 'other';
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

  const toggleSegmentExpand = (key: string) => {
    setExpandedSegments(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const currentTimestamp = playbackIndex !== -1 && trail[playbackIndex]
    ? trail[playbackIndex].timestamp
    : null;

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
      if (seg.type === 'trip' && (seg.maxSpeed ?? 0) > maxSpd) {
        maxSpd = seg.maxSpeed ?? 0;
      }
    }
    return { dist, moving, tripC, stayC, maxSpd };
  }, [dayGroups, trips]);

  // ─────────────────────────────────────────────────────────────────────────
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
          {/* Title bar */}
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
              variant="ghost"
              size="icon"
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
                        m.profile.status === 'offline' ? 'bg-purple-500 ring-purple-500/30' : 'bg-slate-400 ring-slate-400/30'
                      )} />
                      <span className="font-semibold">{m.profile.display_name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time range chips */}
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

          {/* Custom date range */}
          {showFilters && (
            <div className="px-5 pb-3 animate-in slide-in-from-top-2 duration-200">
              <div className="bg-muted/30 rounded-xl p-3 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">{t.fromDate}</label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full h-9 bg-background/80 border border-border/30 rounded-lg px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">{t.toDate}</label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full h-9 bg-background/80 border border-border/30 rounded-lg px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                <Button
                  onClick={() => { setUseCustomRange(true); loadHistory(); }}
                  disabled={loading}
                  size="sm"
                  className="w-full h-8 rounded-lg text-xs font-bold"
                >
                  {t.apply}
                </Button>
              </div>
            </div>
          )}

          {/* Divider */}
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
              {/* ── Enhanced Summary ─────────────────────────────────────── */}
              <div className="shrink-0 px-4 py-3.5 bg-gradient-to-b from-muted/30 to-transparent">
                <div className="grid grid-cols-2 gap-2">
                  {/* Distance card */}
                  <div className="bg-background/70 rounded-xl p-3 border border-border/15 shadow-sm">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Route className="w-3.5 h-3.5 text-primary/70" />
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t.totalDist}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-black text-foreground tabular-nums tracking-tight">
                        {formatDistShort(totalStats.dist)}
                      </span>
                      <span className="text-[11px] font-bold text-muted-foreground">km</span>
                    </div>
                  </div>

                  {/* Moving time card */}
                  <div className="bg-background/70 rounded-xl p-3 border border-border/15 shadow-sm">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Timer className="w-3.5 h-3.5 text-primary/70" />
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t.movingTime}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-black text-foreground tabular-nums tracking-tight">
                        {formatDuration(totalStats.moving)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stats badges row */}
                <div className="flex items-center gap-2 mt-2.5">
                  <div className="flex items-center gap-1.5 bg-primary/8 rounded-lg px-2.5 py-1.5">
                    <Navigation className="w-3 h-3 text-primary" />
                    <span className="text-[11px] font-bold text-primary">{totalStats.tripC} {t.trips}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-orange-500/8 rounded-lg px-2.5 py-1.5">
                    <MapPin className="w-3 h-3 text-orange-500" />
                    <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400">{totalStats.stayC} {t.stops}</span>
                  </div>
                  {totalStats.maxSpd > 0 && (
                    <div className="flex items-center gap-1.5 bg-red-500/8 rounded-lg px-2.5 py-1.5 ml-auto">
                      <Gauge className="w-3 h-3 text-red-500" />
                      <span className="text-[11px] font-bold text-red-600 dark:text-red-400">
                        {Math.round(totalStats.maxSpd)} {t.speed}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Trip Timeline ────────────────────────────────────────── */}
              <ScrollArea className="flex-1 min-h-0" ref={scrollAreaRef as any}>
                <div className="pb-36">
                  {dayGroups.map((group) => {
                    const isCollapsed = collapsedDays.has(group.dateKey);

                    return (
                      <div key={group.dateKey}>
                        {/* Day header */}
                        <button
                          onClick={() => toggleDayCollapse(group.dateKey)}
                          className="w-full flex items-center justify-between px-5 py-3 bg-muted/30 hover:bg-muted/50 transition-colors sticky top-0 z-10"
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
                            <div className={cn(
                              "w-5 h-5 rounded-md flex items-center justify-center transition-transform duration-200",
                              isCollapsed ? "" : "rotate-90"
                            )}>
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                          </div>
                        </button>

                        {/* Segments */}
                        {!isCollapsed && (
                          <div className="relative">
                            {group.segments.map((seg, i) => {
                              const active = isSegmentActive(seg) || activeSegmentId === seg.startTime;
                              const isTrip = seg.type === 'trip';
                              const actType = isTrip ? getActivityType(seg.avgSpeed ?? 0) : null;
                              const actConfig = actType ? ACTIVITY_CONFIG[actType] : null;
                              const isExpanded = expandedSegments.has(seg.startTime);
                              const isLast = i === group.segments.length - 1;
                              const category = !isTrip ? getCategory(seg.startLocation.lat, seg.startLocation.lng) : 'other';
                              const categoryConfig = CATEGORY_CONFIG[category];
                              const CategoryIcon = CATEGORY_ICONS[category];

                              return (
                                <div key={seg.startTime}>
                                  {isTrip ? (
                                    /* ── Trip Segment ─────────────────────────── */
                                    <div
                                      ref={(el) => { segmentRefs.current[seg.startTime] = el; }}
                                      className={cn(
                                        'relative transition-all duration-200',
                                        active ? 'bg-primary/5' : ''
                                      )}
                                    >
                                      {/* Trip connector line */}
                                      <div className="flex">
                                        {/* Left timeline column */}
                                        <div className="w-14 shrink-0 flex flex-col items-center relative">
                                          <div
                                            className="w-0.5 flex-1 opacity-60"
                                            style={{
                                              background: `repeating-linear-gradient(to bottom, ${actConfig?.lineColor || '#94A3B8'} 0, ${actConfig?.lineColor || '#94A3B8'} 4px, transparent 4px, transparent 8px)`
                                            }}
                                          />
                                        </div>

                                        {/* Trip card */}
                                        <div
                                          className={cn(
                                            'flex-1 mr-4 my-1 cursor-pointer group'
                                          )}
                                          onClick={() => handleSegmentClick(seg)}
                                        >
                                          <div className={cn(
                                            "rounded-xl border p-3 transition-all duration-200",
                                            active
                                              ? "border-primary/30 bg-primary/5 shadow-sm shadow-primary/10"
                                              : "border-border/15 bg-muted/20 hover:bg-muted/40 hover:border-border/30"
                                          )}>
                                            {/* Activity type + duration header */}
                                            <div className="flex items-center justify-between mb-2">
                                              <div className="flex items-center gap-2">
                                                {actConfig && (
                                                  <div className={cn(
                                                    "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold",
                                                    actConfig.bg, actConfig.text
                                                  )}>
                                                    <actConfig.icon className="w-3 h-3" />
                                                    {actConfig.label[language]}
                                                  </div>
                                                )}
                                                <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                                                  {format(new Date(seg.startTime), 'HH:mm')} → {format(new Date(seg.endTime), 'HH:mm')}
                                                </span>
                                              </div>
                                              <span className="text-[11px] font-bold text-foreground tabular-nums">
                                                {formatDuration(seg.durationMinutes)}
                                              </span>
                                            </div>

                                            {/* Route visual: From → To */}
                                            <div className="relative pl-4 space-y-1 mb-2.5">
                                              {/* Vertical route line */}
                                              <div className="absolute left-[3px] top-[7px] bottom-[7px] w-0.5 bg-gradient-to-b from-emerald-500 via-muted-foreground/20 to-red-500 rounded-full" />

                                              {/* Start point */}
                                              <div className="flex items-start gap-2 relative">
                                                <div className="absolute -left-4 top-[3px] w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20 z-10" />
                                                <p className="text-[11px] text-foreground/80 leading-snug line-clamp-2 pl-0.5">
                                                  {getAddrShort(seg.startLocation.lat, seg.startLocation.lng)}
                                                </p>
                                              </div>

                                              {/* End point */}
                                              <div className="flex items-start gap-2 relative">
                                                <div className="absolute -left-4 top-[3px] w-2 h-2 rounded-full bg-red-500 ring-2 ring-red-500/20 z-10" />
                                                <p className="text-[11px] text-foreground/80 leading-snug line-clamp-2 pl-0.5">
                                                  {getAddrShort(seg.endLocation.lat, seg.endLocation.lng)}
                                                </p>
                                              </div>
                                            </div>

                                            {/* Stats pills */}
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-md">
                                                <Route className="w-2.5 h-2.5" />
                                                {formatDist(seg.distance ?? 0)}
                                              </span>
                                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-md">
                                                <Gauge className="w-2.5 h-2.5" />
                                                ⌀ {Math.round(seg.avgSpeed ?? 0)} {t.speed}
                                              </span>
                                              {(seg.maxSpeed ?? 0) > 0 && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-md">
                                                  <TrendingUp className="w-2.5 h-2.5" />
                                                  {t.maxSpeed} {Math.round(seg.maxSpeed ?? 0)}
                                                </span>
                                              )}
                                              <span className="text-[9px] font-medium text-muted-foreground/60 ml-auto tabular-nums">
                                                {seg.points.length} {t.points}
                                              </span>
                                            </div>

                                            {/* Expanded: Full addresses */}
                                            {isExpanded && (
                                              <div className="mt-2.5 pt-2.5 border-t border-border/15 space-y-2 animate-in slide-in-from-top-1 duration-200">
                                                <div>
                                                  <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">{t.from}</span>
                                                  <p className="text-[11px] text-foreground/70 mt-0.5 leading-relaxed">
                                                    {getAddrFull(seg.startLocation.lat, seg.startLocation.lng)}
                                                  </p>
                                                </div>
                                                <div>
                                                  <span className="text-[9px] font-bold text-red-600 uppercase tracking-wider">{t.to}</span>
                                                  <p className="text-[11px] text-foreground/70 mt-0.5 leading-relaxed">
                                                    {getAddrFull(seg.endLocation.lat, seg.endLocation.lng)}
                                                  </p>
                                                </div>
                                              </div>
                                            )}

                                            {/* Expand toggle */}
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleSegmentExpand(seg.startTime);
                                              }}
                                              className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-primary/60 hover:text-primary transition-colors"
                                            >
                                              {isExpanded ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                              {isExpanded ? t.hideDetails : t.showDetails}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    /* ── Stay Segment ───────────────────────────── */
                                    <div
                                      ref={(el) => { segmentRefs.current[seg.startTime] = el; }}
                                      onClick={() => handleSegmentClick(seg)}
                                      className={cn(
                                        'relative flex cursor-pointer transition-all duration-200 group',
                                        active ? 'bg-orange-500/5' : 'hover:bg-muted/30'
                                      )}
                                    >
                                      {/* Left timeline column */}
                                      <div className="w-14 shrink-0 flex flex-col items-center py-3">
                                        {/* Top line */}
                                        {i > 0 && <div className="w-0.5 h-2 bg-border/30" />}

                                        {/* Stay node */}
                                        <div className={cn(
                                          "w-9 h-9 rounded-xl flex items-center justify-center border-2 transition-all",
                                          active
                                            ? "border-orange-500 bg-orange-500/10 scale-110 shadow-sm shadow-orange-500/20"
                                            : "border-border/30 bg-background group-hover:border-border/50"
                                        )}>
                                          <CategoryIcon className="w-4 h-4" style={{ color: categoryConfig.color }} />
                                        </div>

                                        {/* Bottom line */}
                                        {!isLast && <div className="w-0.5 flex-1 bg-border/30 mt-px" />}
                                      </div>

                                      {/* Content */}
                                      <div className="flex-1 pr-4 py-3 min-w-0">
                                        {/* Time + Duration header */}
                                        <div className="flex items-center justify-between mb-1">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-[11px] font-bold tabular-nums text-foreground">
                                              {format(new Date(seg.startTime), 'HH:mm')}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground/40">—</span>
                                            <span className="text-[11px] font-bold tabular-nums text-foreground">
                                              {format(new Date(seg.endTime), 'HH:mm')}
                                            </span>
                                          </div>
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

                                        {/* Address (full) */}
                                        <p className={cn(
                                          "text-[12px] font-medium leading-snug",
                                          active ? "text-foreground" : "text-foreground/80"
                                        )}>
                                          {getAddrFull(seg.startLocation.lat, seg.startLocation.lng)}
                                        </p>

                                        {/* Category label */}
                                        {category !== 'other' && (
                                          <div className="flex items-center gap-1 mt-1.5">
                                            <span className="text-sm">{categoryConfig.emoji}</span>
                                            <span className="text-[10px] font-semibold" style={{ color: categoryConfig.color }}>
                                              {categoryConfig.label[language]}
                                            </span>
                                          </div>
                                        )}

                                        {/* House number highlight if available */}
                                        {(() => {
                                          const addr = getAddr(seg.startLocation.lat, seg.startLocation.lng);
                                          if (addr?.houseNumber && addr?.road) {
                                            return (
                                              <div className="flex items-center gap-1.5 mt-1.5 bg-blue-500/8 rounded-md px-2 py-1 w-fit">
                                                <Home className="w-3 h-3 text-blue-500" />
                                                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                                                  {addr.houseNumber} {addr.road}
                                                </span>
                                              </div>
                                            );
                                          }
                                          return null;
                                        })()}
                                      </div>
                                    </div>
                                  )}
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

              {/* ── Playback Bar (Dynamic Island style) ────────────────────── */}
              {trail.length > 0 && !loading && (
                <div className={cn(
                  "absolute left-4 right-4 z-40 transition-all duration-500 ease-in-out",
                  isPlaybackMinimized ? "bottom-[-100px] opacity-0 pointer-events-none" : "bottom-6 opacity-100"
                )}>
                  <div className="bg-foreground/95 dark:bg-background/95 backdrop-blur-xl rounded-2xl p-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.25)] border border-white/5 relative group">
                    {/* Minimize toggle */}
                    <button
                      onClick={() => setIsPlaybackMinimized(true)}
                      className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-6 bg-foreground/95 dark:bg-background/95 border border-white/5 rounded-t-lg flex items-center justify-center cursor-pointer hover:bg-foreground dark:hover:bg-background transition-colors"
                    >
                      <ChevronDown className="w-3.5 h-3.5 text-background/70 dark:text-foreground/70" />
                    </button>

                    {/* Slider */}
                    <input
                      type="range"
                      min="0"
                      max={trail.length - 1}
                      value={playbackIndex === -1 ? trail.length - 1 : playbackIndex}
                      onChange={(e) => handleSeek(parseInt(e.target.value))}
                      className="w-full h-1 rounded-full appearance-none cursor-pointer mb-3 playback-slider"
                      dir="rtl"
                    />

                    {/* Controls row */}
                    <div className="flex items-center justify-between">
                      {/* Time display */}
                      <div className="flex flex-col">
                        <span className="text-[12px] font-black tabular-nums text-background dark:text-foreground">
                          {currentTimestamp ? format(new Date(currentTimestamp), 'HH:mm:ss') : '--:--'}
                        </span>
                        <span className="text-[9px] font-semibold text-background/50 dark:text-foreground/50 tabular-nums">
                          {currentTimestamp ? format(new Date(currentTimestamp), 'dd/MM/yyyy') : ''}
                        </span>
                      </div>

                      {/* Current speed indicator */}
                      {playbackIndex !== -1 && trail[playbackIndex] && (
                        <div className="flex items-center gap-1 bg-background/15 dark:bg-white/10 rounded-lg px-2 py-1">
                          <Gauge className="w-3 h-3 text-background/60 dark:text-foreground/60" />
                          <span className="text-[10px] font-bold tabular-nums text-background/80 dark:text-foreground/80">
                            {Math.round(trail[playbackIndex].speed ?? 0)} {t.speed}
                          </span>
                        </div>
                      )}

                      {/* Play controls */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={togglePlayback}
                          className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90",
                            isPlaying
                              ? "bg-primary text-white shadow-lg shadow-primary/30"
                              : "bg-background/20 dark:bg-white/10 text-background dark:text-foreground hover:bg-background/30 dark:hover:bg-white/15"
                          )}
                        >
                          {isPlaying
                            ? <Pause className="w-4 h-4" />
                            : <Play className="w-4 h-4 ml-0.5" />
                          }
                        </button>

                        <button
                          onClick={nextPlaybackSpeed}
                          className="h-8 px-2.5 rounded-lg bg-background/15 dark:bg-white/10 text-[10px] font-black text-background dark:text-foreground transition-all active:scale-95 hover:bg-background/25 dark:hover:bg-white/15 tabular-nums"
                        >
                          {playbackSpeed}×
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Floating Re-open Button when hidden */}
              {trail.length > 0 && !loading && (
                <button
                  onClick={() => setIsPlaybackMinimized(false)}
                  className={cn(
                    "absolute right-4 bottom-6 w-12 h-12 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.2)] bg-foreground/95 dark:bg-background/95 backdrop-blur-xl border border-white/5 flex items-center justify-center text-background dark:text-foreground transition-all duration-300 z-50",
                    isPlaybackMinimized ? "scale-100 opacity-100 translate-y-0" : "scale-50 opacity-0 translate-y-8 pointer-events-none"
                  )}
                >
                  <PlayCircle className="w-6 h-6" />
                </button>
              )}
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
