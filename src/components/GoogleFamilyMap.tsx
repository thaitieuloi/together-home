import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, OverlayView, Polyline, Circle } from '@react-google-maps/api';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

const COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#14b8a6'];

const MAP_TEXT = {
  vi: {
    online: 'Online',
    background: 'Đang chạy ngầm',
    closed: 'Đã đóng app',
    offline: 'Đã đăng xuất',
    lastSeenPrefix: 'Truy cập',
    lastSeenSuffix: 'phút trước',
    justNow: 'Truy cập vừa xong',
    live: '📡 Đang chia sẻ Live',
    radius: 'Bán kính',
    started: 'Bắt đầu',
    ended: 'Kết thúc',
    loading: 'Đang tải bản đồ...',
    noApiKey: 'Chưa có Google Maps API Key',
  },
  en: {
    online: 'Online',
    background: 'Background',
    closed: 'App closed',
    offline: 'Signed out',
    lastSeenPrefix: 'Accessed',
    lastSeenSuffix: 'mins ago',
    justNow: 'Accessed just now',
    live: '📡 Live sharing',
    radius: 'Radius',
    started: 'Start',
    ended: 'End',
    loading: 'Loading map...',
    noApiKey: 'Google Maps API Key missing',
  },
};

const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

const defaultCenter = {
  lat: 10.8231,
  lng: 106.6297,
};

const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  styles: [
    {
      "featureType": "all",
      "elementType": "labels.text.fill",
      "stylers": [{ "color": "#7c93a3" }, { "lightness": "-10" }]
    },
    {
      "featureType": "administrative.country",
      "elementType": "geometry",
      "stylers": [{ "visibility": "on" }]
    },
    {
      "featureType": "administrative.country",
      "elementType": "geometry.stroke",
      "stylers": [{ "color": "#a0a0a0" }]
    },
    {
      "featureType": "administrative.province",
      "elementType": "geometry.stroke",
      "stylers": [{ "color": "#d0d0d0" }]
    },
    {
      "featureType": "landscape",
      "elementType": "geometry.fill",
      "stylers": [{ "color": "#f5f5f5" }]
    },
    {
      "featureType": "poi",
      "elementType": "geometry.fill",
      "stylers": [{ "color": "#e0e0e0" }]
    },
    {
      "featureType": "road",
      "elementType": "geometry.fill",
      "stylers": [{ "color": "#ffffff" }]
    },
    {
      "featureType": "road",
      "elementType": "geometry.stroke",
      "stylers": [{ "color": "#e0e0e0" }]
    },
    {
        "featureType": "water",
        "elementType": "geometry.fill",
        "stylers": [
            { "color": "#cae3f1" }
        ]
    }
  ],
};

function getFreshnessColor(member: FamilyMemberWithProfile, language: 'vi' | 'en'): { dot: string; label: string; isOffline: boolean } {
  const timestamp = member.location?.timestamp;
  if (!timestamp) return { dot: '#94a3b8', label: 'Offline', isOffline: true };

  const diffMs = Math.max(0, Date.now() - new Date(timestamp).getTime());
  const diffMin = diffMs / 60000;
  const text = MAP_TEXT[language];
  const { status, push_token } = member.profile;

  const isActuallyOnline = status === 'online' && diffMin < 2;
  const isActuallyBackground = status === 'idle' && diffMin < 5;
  const isActuallyClosed = (status === 'offline' || (status === 'idle' && diffMin >= 5) || (status === 'online' && diffMin >= 2)) && push_token != null && diffMin < 10080;
  const isActuallySignedOut = status === 'offline' && push_token == null;

  if (isActuallyOnline) return { dot: '#10b981', label: text.online, isOffline: false };
  if (isActuallyBackground) {
    const timeStr = diffMin < 1 ? text.justNow : `${text.lastSeenPrefix} ${Math.round(diffMin)} ${text.lastSeenSuffix}`;
    return { dot: '#f97316', label: timeStr, isOffline: false };
  }
  if (isActuallyClosed) {
    const timeStr = diffMin < 1 ? text.justNow : `${text.lastSeenPrefix} ${Math.round(diffMin)} ${text.lastSeenSuffix}`;
    return { dot: '#a855f7', label: timeStr, isOffline: true };
  }
  
  return { dot: '#cbd5e1', label: text.offline, isOffline: true };
}

interface CustomMarkerProps {
    member: FamilyMemberWithProfile;
    color: string;
    freshness: { dot: string; label: string; isOffline: boolean };
    language: 'vi' | 'en';
    isLive: boolean;
    onClick?: () => void;
}

const CustomMarker = ({ member, color, freshness, language, isLive, onClick }: CustomMarkerProps) => {
    const initials = member.profile.display_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const shortName = member.profile.display_name.split(' ').pop() ?? member.profile.display_name;
    const loc = member.location!;
    const speedKmh = loc.speed !== null && loc.speed !== undefined ? loc.speed * 3.6 : null;
    const isMoving = loc.is_moving ?? null;
    const isOffline = freshness.isOffline;
    const avatarUrl = member.profile.avatar_url;

    const speedBadge = isMoving && speedKmh && speedKmh > 3
        ? (
            <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border-[1.5px] border-white shadow-md whitespace-nowrap z-20">
                {Math.round(speedKmh)} km/h
            </span>
        ) : null;

    return (
        <OverlayView
            position={{ lat: loc.latitude, lng: loc.longitude }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            getPixelPositionOffset={(width, height) => ({ x: -(width / 2), y: -(height / 2) })}
        >
            <div 
                className={cn(
                    "relative flex flex-col items-center cursor-pointer transition-opacity duration-300",
                    isOffline ? "opacity-60" : "opacity-100"
                )}
                onClick={(e) => {
                    e.stopPropagation();
                    onClick?.();
                }}
            >
                {speedBadge}
                
                {/* Pulse for live sharing */}
                {isLive && (
                    <div className="absolute inset-x-0 inset-y-0 w-10 h-10 -translate-y-4 rounded-full bg-blue-500/30 animate-ping -z-10" />
                )}

                <div 
                    className="w-10 h-10 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white font-bold text-sm relative overflow-visible"
                    style={{ backgroundColor: color }}
                >
                    {avatarUrl ? (
                        <img 
                            src={avatarUrl} 
                            alt={member.profile.display_name}
                            className="w-full h-full object-cover rounded-full"
                        />
                    ) : (
                        <span>{initials}</span>
                    )}

                    {/* Freshness Status Dot */}
                    <span 
                        className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white z-10"
                        style={{ backgroundColor: freshness.dot }}
                    />
                </div>

                <span className="mt-1 bg-white/95 dark:bg-black/95 text-foreground px-2 py-0.5 rounded-full text-[10px] font-bold shadow-md border border-black/5 dark:border-white/10 whitespace-nowrap max-w-[80px] overflow-hidden text-ellipsis">
                    {shortName}
                </span>

                {/* Accuracy Circle Shadow Concept - simplified here, using Google Circle for real accuracy */}
            </div>
        </OverlayView>
    );
};

interface Props {
  members: FamilyMemberWithProfile[];
  flyTo: { lat: number; lng: number } | null;
  historyTrail?: Tables<'user_locations'>[];
  onMapClick?: (lat: number, lng: number) => void;
  onMemberClick?: (member: FamilyMemberWithProfile) => void;
  showGeofences?: boolean;
  familyId?: string;
  liveSharingUserIds?: Set<string>;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  playbackPoint?: Tables<'user_locations'> | null;
}

export default function GoogleFamilyMap({
  members,
  flyTo,
  historyTrail,
  onMapClick,
  onMemberClick,
  showGeofences,
  familyId,
  liveSharingUserIds = new Set(),
  onRefresh,
  isRefreshing,
  playbackPoint,
}: Props) {
  const { language } = useLanguage();
  const text = MAP_TEXT[language];
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey || '',
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [geofences, setGeofences] = useState<Tables<'geofences'>[]>([]);
  const hasFittedBoundsRef = useRef(false);

  // Filter out members with no location OR very inaccurate IP-based locations (accuracy > 5000m)
  const membersWithLocation = useMemo(
    () => members.filter((m) => m.location && (m.location.accuracy === null || m.location.accuracy < 5000)),
    [members]
  );

  const onLoad = useCallback((m: google.maps.Map) => {
    setMap(m);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Fly to member
  useEffect(() => {
    if (!map || !flyTo) return;
    map.panTo({ lat: flyTo.lat, lng: flyTo.lng });
    map.setZoom(16);
  }, [map, flyTo]);

  // Handle Playback Marker Centering
  useEffect(() => {
    if (!map || !playbackPoint) return;
    if (map.getZoom() > 12) {
      map.panTo({ lat: playbackPoint.latitude, lng: playbackPoint.longitude });
    }
  }, [map, playbackPoint]);

  // Fit bounds on initial load
  useEffect(() => {
    if (!map || hasFittedBoundsRef.current || membersWithLocation.length === 0) return;

    if (membersWithLocation.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      membersWithLocation.forEach(m => {
        bounds.extend({ lat: m.location!.latitude, lng: m.location!.longitude });
      });
      map.fitBounds(bounds, 50);
    } else {
      const loc = membersWithLocation[0].location!;
      map.setCenter({ lat: loc.latitude, lng: loc.longitude });
      map.setZoom(15);
    }
    hasFittedBoundsRef.current = true;
  }, [map, membersWithLocation]);

  // Load geofences
  useEffect(() => {
    if (!showGeofences || !familyId) {
        setGeofences([]);
        return;
    }

    const loadGeofences = async () => {
      const { data } = await supabase.from('geofences').select('*').eq('family_id', familyId);
      if (data) setGeofences(data);
    };

    void loadGeofences();
  }, [showGeofences, familyId]);

  // History path segments - Google Maps Polyline is one contiguous line usually,
  // but if we want per-segment colors, we might need multiple Polylines or a complex path.
  // For now, I'll use a single fallback but we can optimize.
  const historySegments = useMemo(() => {
    if (!historyTrail || historyTrail.length < 2) return [];
    
    // Reverse to chronological order for drawing if needed
    const sortedTrail = [...historyTrail].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    const segments: { path: { lat: number; lng: number }[], color: string }[] = [];
    
    for (let i = 0; i < sortedTrail.length - 1; i++) {
        const curr = sortedTrail[i];
        const next = sortedTrail[i+1];
        const speedMs = (curr as any).speed ?? 0;
        const kmh = speedMs * 3.6;
        
        let segColor = '#6b7280';
        if (speedMs > 0.5) {
            if (kmh > 40) segColor = '#ef4444';
            else if (kmh > 15) segColor = '#f97316';
            else if (kmh > 5) segColor = '#eab308';
            else segColor = '#3b82f6';
        }

        segments.push({
            path: [
                { lat: curr.latitude, lng: curr.longitude },
                { lat: next.latitude, lng: next.longitude }
            ],
            color: segColor
        });
    }
    return segments;
  }, [historyTrail]);

  // Zoom to history trail when loaded
  useEffect(() => {
    if (!map || !historyTrail || historyTrail.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    historyTrail.forEach(loc => bounds.extend({ lat: loc.latitude, lng: loc.longitude }));
    map.fitBounds(bounds, 50);
  }, [map, historyTrail]);

  if (loadError) {
    return (
        <div className="w-full h-full flex items-center justify-center bg-background text-destructive p-4 text-center font-bold">
            Failed to load Google Maps: {loadError.message}
        </div>
    );
  }

  if (!apiKey) {
    return (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-900 text-muted-foreground p-8 text-center flex-col gap-4">
            <div className="p-4 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-500 rounded-2xl border border-amber-200 dark:border-amber-900/50 max-w-sm">
                <p className="font-bold text-lg mb-2">{text.noApiKey}</p>
                <p className="text-sm">Vui lòng thêm <code>VITE_GOOGLE_MAPS_API_KEY</code> vào file <code>.env</code> để hiển thị bản đồ.</p>
            </div>
        </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {isLoaded ? (
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={defaultCenter}
          zoom={13}
          onLoad={onLoad}
          onUnmount={onUnmount}
          options={mapOptions}
          onClick={(e) => {
            if (e.latLng) onMapClick?.(e.latLng.lat(), e.latLng.lng());
          }}
        >
            {/* Family Members */}
            {membersWithLocation.map((m, i) => (
                <CustomMarker 
                    key={m.user_id}
                    member={m}
                    color={COLORS[i % COLORS.length]}
                    freshness={getFreshnessColor(m, language)}
                    language={language}
                    isLive={liveSharingUserIds.has(m.user_id)}
                    onClick={() => onMemberClick?.(m)}
                />
            ))}

            {/* Accuracy Circles */}
            {membersWithLocation.map((m, i) => (
                m.location?.accuracy && m.location.accuracy <= 100 && (
                    <Circle 
                        key={`acc-${m.user_id}`}
                        center={{ lat: m.location!.latitude, lng: m.location!.longitude }}
                        radius={m.location!.accuracy}
                        options={{
                            fillColor: COLORS[i % COLORS.length],
                            fillOpacity: 0.08,
                            strokeColor: COLORS[i % COLORS.length],
                            strokeOpacity: 0.3,
                            strokeWeight: 1,
                            clickable: false,
                        }}
                    />
                )
            ))}

            {/* Geofences */}
            {geofences.map(g => (
                <Circle 
                    key={g.id}
                    center={{ lat: g.latitude, lng: g.longitude }}
                    radius={g.radius_meters}
                    options={{
                        fillColor: '#3b82f6',
                        fillOpacity: 0.1,
                        strokeColor: '#3b82f6',
                        strokeOpacity: 0.5,
                        strokeWeight: 2,
                        clickable: false,
                    }}
                />
            ))}

            {/* History Trail */}
            {historySegments.map((seg, i) => (
                <Polyline 
                    key={`hist-seg-${i}`}
                    path={seg.path}
                    options={{
                        strokeColor: seg.color,
                        strokeOpacity: 0.8,
                        strokeWeight: 4,
                    }}
                />
            ))}

            {/* History Points (dots) */}
            {historyTrail && historyTrail.length > 0 && historyTrail.map((loc, i) => (
                <Circle 
                    key={`hist-point-${i}`}
                    center={{ lat: loc.latitude, lng: loc.longitude }}
                    radius={1}
                    options={{
                        fillColor: '#ffffff',
                        fillOpacity: 1,
                        strokeColor: '#6b7280',
                        strokeOpacity: 0.5,
                        strokeWeight: 1,
                        clickable: false,
                    }}
                />
            ))}

            {/* Playback Marker */}
            {playbackPoint && (
                <OverlayView
                    position={{ lat: playbackPoint.latitude, lng: playbackPoint.longitude }}
                    mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                    getPixelPositionOffset={(width, height) => ({ x: -(width / 2), y: -(height / 2) })}
                >
                    <div className="w-8 h-8 bg-blue-500 border-2 border-white rounded-full shadow-2xl flex items-center justify-center text-white scale-125 transition-all duration-300">
                        {((playbackPoint as any).speed ?? 0) * 3.6 > 20 ? '🚗' : '🚶'}
                    </div>
                </OverlayView>
            )}
        </GoogleMap>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-background">
             <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <p className="text-sm font-bold text-muted-foreground animate-pulse">{text.loading}</p>
             </div>
        </div>
      )}

      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/90 backdrop-blur-sm border border-border/50 shadow-lg text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          title="Refresh locations"
        >
          <svg
            className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isRefreshing ? 'Đang cập nhật...' : 'Làm mới vị trí'}
        </button>
      )}
    </div>
  );
}
