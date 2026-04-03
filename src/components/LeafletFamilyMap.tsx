import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';
import { enUS, vi } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

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
  },
};

const TILE_BY_LANGUAGE = {
  vi: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  en: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
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
    const timeStr = diffMin <= 5 ? text.justNow : `${text.lastSeenPrefix} ${Math.round(diffMin)} ${text.lastSeenSuffix}`;
    return { dot: '#f97316', label: timeStr, isOffline: false };
  }
  if (isActuallyClosed) {
    const timeStr = diffMin <= 5 ? text.justNow : `${text.lastSeenPrefix} ${Math.round(diffMin)} ${text.lastSeenSuffix}`;
    return { dot: '#a855f7', label: timeStr, isOffline: true };
  }
  
  return { dot: '#94a3b8', label: text.offline, isOffline: true };
}

function createCustomIcon(
  initials: string,
  color: string,
  freshnessColor: string,
  displayName: string,
  speedKmh: number | null,
  isMoving: boolean | null,
  avatarUrl: string | null,
  isOffline?: boolean
) {
  const shortName = displayName.split(' ').pop() ?? displayName;
  const speedBadge =
    isMoving && speedKmh && speedKmh > 3
      ? `<span style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:#2563eb;color:white;font-size:9px;font-weight:700;padding:1px 6px;border-radius:999px;white-space:nowrap;border:1.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.25);">${Math.round(speedKmh)} km/h</span>`
      : '';
  const offlineOpacity = isOffline ? 0.6 : 1;
  const innerContent = avatarUrl 
    ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
    : initials;

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="position:relative;width:44px;display:flex;flex-direction:column;align-items:center;opacity:${offlineOpacity};">
        ${speedBadge}
        <div style="
          width:40px;height:40px;border-radius:50%;
          background:${color};border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
          color:white;font-weight:600;font-size:14px;
          font-family:system-ui,sans-serif;position:relative;
          overflow:hidden;
        ">${innerContent}
          <span style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:${freshnessColor};border:2px solid white;"></span>
        </div>
        <span style="
          margin-top:3px;
          background:rgba(255,255,255,0.95);color:#111827;
          font-size:10px;font-weight:600;
          padding:1px 7px;border-radius:999px;
          white-space:nowrap;max-width:80px;
          overflow:hidden;text-overflow:ellipsis;
          box-shadow:0 1px 4px rgba(0,0,0,0.18);
          border:1px solid rgba(0,0,0,0.08);
        ">${shortName}</span>
      </div>
    `,
    iconSize: [44, 64],
    iconAnchor: [22, 20],
    popupAnchor: [0, -48],
  });
}

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
  onFitAllMembers?: () => void;
}

export default function LeafletFamilyMap({
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
  onFitAllMembers,
}: Props) {
  const { language } = useLanguage();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const accuracyCirclesRef = useRef<Map<string, L.Circle>>(new Map());
  const liveCirclesRef = useRef<Map<string, L.Circle>>(new Map());
  const historyLayerRef = useRef<L.LayerGroup | null>(null);
  const geofenceLayerRef = useRef<L.LayerGroup | null>(null);
  const markerLayerRef = useRef<any | null>(null);
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const playbackLayerRef = useRef<L.LayerGroup | null>(null);
  const playbackMarkerRef = useRef<L.Marker | null>(null);
  const hasFittedBoundsRef = useRef(false);
  const animationFramesRef = useRef<Map<string, number>>(new Map());

  // Filter out members with no location OR very inaccurate IP-based locations (accuracy > 5000m)
  const membersWithLocation = useMemo(
    () => members.filter((m) => m.location && (m.location.accuracy === null || m.location.accuracy < 5000)),
    [members]
  );
  const mapText = MAP_TEXT[language];
  const dateLocale = language === 'vi' ? vi : enUS;

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const defaultCenter: [number, number] = [10.8231, 106.6297];

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      center: defaultCenter,
      zoom: 13,
      maxZoom: 19,
    });

    mapRef.current = map;
    markerLayerRef.current = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      removeOutsideVisibleBounds: true,
      disableClusteringAtZoom: 16,
      maxZoom: 19,
      iconCreateFunction: (cluster: any) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div style="background:rgba(59,130,246,0.9);color:white;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.3); backdrop-blur: 4px;">${count}</div>`,
          className: 'custom-cluster-icon',
          iconSize: [40, 40],
        });
      },
    }).addTo(map);

    overlayLayerRef.current = L.layerGroup().addTo(map);
    historyLayerRef.current = L.layerGroup().addTo(map);
    geofenceLayerRef.current = L.layerGroup().addTo(map);
    playbackLayerRef.current = L.layerGroup().addTo(map);

    // Inject pulse animation CSS
    const style = document.createElement('style');
    style.textContent = `
      @keyframes live-pulse {
        0% { opacity: 0.6; transform: scale(1); }
        50% { opacity: 0.2; transform: scale(1.3); }
        100% { opacity: 0.6; transform: scale(1); }
      }
      .live-pulse-circle {
        animation: live-pulse 2s ease-in-out infinite;
        transform-origin: center;
      }
    `;
    document.head.appendChild(style);

    return () => {
      animationFramesRef.current.forEach((id) => cancelAnimationFrame(id));
      animationFramesRef.current.clear();

      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      markerLayerRef.current = null;
      overlayLayerRef.current = null;
      historyLayerRef.current = null;
      geofenceLayerRef.current = null;
      playbackLayerRef.current = null;
      playbackMarkerRef.current = null;
      markersRef.current.clear();
      accuracyCirclesRef.current.clear();
      liveCirclesRef.current.clear();
      style.remove();
    };
  }, []);

  // Update tile layer by language
  useEffect(() => {
    if (!mapRef.current) return;

    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    const selectedTile = TILE_BY_LANGUAGE[language];
    tileLayerRef.current = L.tileLayer(selectedTile.url, {
      attribution: selectedTile.attribution,
      maxZoom: 19,
    }).addTo(mapRef.current);
  }, [language]);

  // Map click handler
  useEffect(() => {
    if (!mapRef.current) return;
    const handler = (e: L.LeafletMouseEvent) => {
      onMapClick?.(e.latlng.lat, e.latlng.lng);
    };
    mapRef.current.on('click', handler);
    return () => {
      mapRef.current?.off('click', handler);
    };
  }, [onMapClick]);

  // Load and display geofences
  useEffect(() => {
    if (!mapRef.current || !geofenceLayerRef.current) return;
    geofenceLayerRef.current.clearLayers();

    if (!showGeofences || !familyId) return;

    const loadGeofences = async () => {
      const { data } = await supabase.from('geofences').select('*').eq('family_id', familyId);

      if (!data || !geofenceLayerRef.current) return;

      data.forEach((g) => {
        const circle = L.circle([g.latitude, g.longitude], {
          radius: g.radius_meters,
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.1,
          weight: 2,
          dashArray: '6 4',
        });

        circle.bindPopup(`
          <div style="text-align:center;">
            <p style="margin:0; font-weight:600;">${g.name}</p>
            <p style="margin:2px 0 0; font-size:12px; color:#6b7280;">${mapText.radius}: ${g.radius_meters}m</p>
          </div>
        `);

        geofenceLayerRef.current!.addLayer(circle);
      });
    };

    void loadGeofences();
  }, [showGeofences, familyId, mapText.radius]);

  // Update markers with smooth transitions + live pulse circles
  useEffect(() => {
    if (!mapRef.current || !markerLayerRef.current) return;

    const animateMemberTo = (userId: string, targetLatLng: [number, number]) => {
      const marker = markersRef.current.get(userId);
      if (!marker) return;

      const startLatLng = marker.getLatLng();
      const startLat = startLatLng.lat;
      const startLng = startLatLng.lng;

      if (startLat === targetLatLng[0] && startLng === targetLatLng[1]) {
        return;
      }

      const activeAnimation = animationFramesRef.current.get(userId);
      if (activeAnimation) {
        cancelAnimationFrame(activeAnimation);
      }

      const startTime = performance.now();
      const duration = 1000;

      const step = (time: number) => {
        const progress = Math.min(1, (time - startTime) / duration);
        const eased = 1 - (1 - progress) ** 3;
        const lat = startLat + (targetLatLng[0] - startLat) * eased;
        const lng = startLng + (targetLatLng[1] - startLng) * eased;

        marker.setLatLng([lat, lng]);
        accuracyCirclesRef.current.get(userId)?.setLatLng([lat, lng]);
        liveCirclesRef.current.get(userId)?.setLatLng([lat, lng]);

        if (progress < 1) {
          const frameId = requestAnimationFrame(step);
          animationFramesRef.current.set(userId, frameId);
        } else {
          animationFramesRef.current.delete(userId);
        }
      };

      const frameId = requestAnimationFrame(step);
      animationFramesRef.current.set(userId, frameId);
    };

    const existingIds = new Set(markersRef.current.keys());
    const currentIds = new Set(membersWithLocation.map((m) => m.user_id));

    // Remove markers for members no longer present
    for (const id of existingIds) {
      if (!currentIds.has(id)) {
        const marker = markersRef.current.get(id);
        if (marker) markerLayerRef.current.removeLayer(marker);
        markersRef.current.delete(id);

        const circle = accuracyCirclesRef.current.get(id);
        if (circle) overlayLayerRef.current?.removeLayer(circle);
        accuracyCirclesRef.current.delete(id);

        const liveCircle = liveCirclesRef.current.get(id);
        if (liveCircle) overlayLayerRef.current?.removeLayer(liveCircle);
        liveCirclesRef.current.delete(id);

        const frame = animationFramesRef.current.get(id);
        if (frame) {
          cancelAnimationFrame(frame);
          animationFramesRef.current.delete(id);
        }
      }
    }

    membersWithLocation.forEach((m, i) => {
      const loc = m.location!;
      const latlng: [number, number] = [loc.latitude, loc.longitude];
      const freshness = getFreshnessColor(m, language);
      const isOffline = freshness.isOffline;
      const icon = createCustomIcon(
        getInitials(m.profile.display_name),
        COLORS[i % COLORS.length],
        freshness.dot,
        m.profile.display_name,
        loc.speed !== null && loc.speed !== undefined ? loc.speed * 3.6 : null,
        loc.is_moving ?? null,
        m.profile.avatar_url,
        isOffline
      );
      const isLive = liveSharingUserIds.has(m.user_id);

      const existingMarker = markersRef.current.get(m.user_id);
      if (existingMarker) {
        existingMarker.setIcon(icon);

        // Update accuracy circle
        const existingCircle = accuracyCirclesRef.current.get(m.user_id);
        if (loc.accuracy && loc.accuracy <= 100) {
          if (existingCircle) {
            existingCircle.setRadius(loc.accuracy);
          } else {
            const circle = L.circle(latlng, {
              radius: loc.accuracy,
              color: COLORS[i % COLORS.length],
              fillColor: COLORS[i % COLORS.length],
              fillOpacity: 0.08,
              weight: 1,
              opacity: 0.3,
            });
            overlayLayerRef.current!.addLayer(circle);
            accuracyCirclesRef.current.set(m.user_id, circle);
          }
        } else if (existingCircle) {
          overlayLayerRef.current!.removeLayer(existingCircle);
          accuracyCirclesRef.current.delete(m.user_id);
        }

        // Live pulse circle
        const existingLive = liveCirclesRef.current.get(m.user_id);
        if (isLive) {
          if (!existingLive) {
            const liveCircle = L.circle(latlng, {
              radius: 60,
              color: COLORS[i % COLORS.length],
              fillColor: COLORS[i % COLORS.length],
              fillOpacity: 0.15,
              weight: 2,
              opacity: 0.5,
              className: 'live-pulse-circle',
            });
            overlayLayerRef.current!.addLayer(liveCircle);
            liveCirclesRef.current.set(m.user_id, liveCircle);
          }
        } else if (existingLive) {
          overlayLayerRef.current!.removeLayer(existingLive);
          liveCirclesRef.current.delete(m.user_id);
        }

        animateMemberTo(m.user_id, latlng);
      } else {
        // New marker
        const marker = L.marker(latlng, { icon });
        marker.on('click', () => { onMemberClick?.(m); });
        markerLayerRef.current!.addLayer(marker);
        markersRef.current.set(m.user_id, marker);

        // Accuracy circle
        if (loc.accuracy && loc.accuracy <= 100) {
          const circle = L.circle(latlng, {
            radius: loc.accuracy,
            color: COLORS[i % COLORS.length],
            fillColor: COLORS[i % COLORS.length],
            fillOpacity: 0.08,
            weight: 1,
            opacity: 0.3,
          });
          overlayLayerRef.current!.addLayer(circle);
          accuracyCirclesRef.current.set(m.user_id, circle);
        }

        if (isLive) {
          const liveCircle = L.circle(latlng, {
            radius: 60,
            color: COLORS[i % COLORS.length],
            fillColor: COLORS[i % COLORS.length],
            fillOpacity: 0.15,
            weight: 2,
            opacity: 0.5,
            className: 'live-pulse-circle',
          });
          overlayLayerRef.current!.addLayer(liveCircle);
          liveCirclesRef.current.set(m.user_id, liveCircle);
        }
      }
    });

    // Auto-fit bounds only on first load
    if (!hasFittedBoundsRef.current && membersWithLocation.length > 0) {
      if (membersWithLocation.length > 1) {
        const bounds = L.latLngBounds(
          membersWithLocation.map(
            (m) => [m.location!.latitude, m.location!.longitude] as [number, number]
          )
        );
        mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } else {
        const loc = membersWithLocation[0].location!;
        mapRef.current.setView([loc.latitude, loc.longitude], 15);
      }
      hasFittedBoundsRef.current = true;
    }
  }, [membersWithLocation, liveSharingUserIds, language, dateLocale]);

  // Fly to member
  useEffect(() => {
    if (!mapRef.current || !flyTo) return;
    mapRef.current.flyTo([flyTo.lat, flyTo.lng], 16, { duration: 1 });
  }, [flyTo]);

  // Draw history trail
  useEffect(() => {
    if (!mapRef.current || !historyLayerRef.current) return;
    historyLayerRef.current.clearLayers();

    if (!historyTrail || historyTrail.length === 0) return;

    const latlngs = historyTrail.map((loc) => [loc.latitude, loc.longitude] as [number, number]);

    // Draw speed-colored segments
    for (let i = 0; i < historyTrail.length - 1; i++) {
      const curr = historyTrail[i];
      const next = historyTrail[i + 1];
      const speedMs = (curr as { speed?: number | null }).speed ?? 0;
      const kmh = speedMs * 3.6;
      let segColor = '#6b7280';
      if (speedMs > 0.5) {
        if (kmh > 40) segColor = '#ef4444';
        else if (kmh > 15) segColor = '#f97316';
        else if (kmh > 5) segColor = '#eab308';
        else segColor = '#3b82f6';
      }
      L.polyline(
        [[curr.latitude, curr.longitude], [next.latitude, next.longitude]],
        { color: segColor, weight: 4, opacity: 0.8 }
      ).addTo(historyLayerRef.current!);

      // Add a small dot for each point to make it more interactive/visible
      L.circleMarker([curr.latitude, curr.longitude], {
        radius: 3,
        color: segColor,
        fillColor: 'white',
        fillOpacity: 1,
        weight: 1,
      }).addTo(historyLayerRef.current!);
    }

    const polyline = L.polyline(latlngs, { color: 'transparent', weight: 0, opacity: 0 });
    historyLayerRef.current.addLayer(polyline);

    const startLoc = historyTrail[historyTrail.length - 1];
    L.circleMarker([startLoc.latitude, startLoc.longitude], {
      radius: 6,
      color: '#22c55e',
      fillColor: '#22c55e',
      fillOpacity: 1,
    })
      .bindPopup(`${mapText.started}: ${new Date(startLoc.timestamp).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}`)
      .addTo(historyLayerRef.current);

    const endLoc = historyTrail[0];
    if (historyTrail.length > 1) {
      L.circleMarker([endLoc.latitude, endLoc.longitude], {
        radius: 6,
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 1,
      })
        .bindPopup(`${mapText.ended}: ${new Date(endLoc.timestamp).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}`)
        .addTo(historyLayerRef.current);

      mapRef.current.fitBounds(polyline.getBounds(), { padding: [50, 50] });
    } else {
      mapRef.current.setView([startLoc.latitude, startLoc.longitude], 15);
    }
  }, [historyTrail, mapText.started, mapText.ended, language]);

  // Handle Playback Marker
  useEffect(() => {
    if (!mapRef.current || !playbackLayerRef.current) return;

    if (!playbackPoint) {
      if (playbackMarkerRef.current) {
        playbackLayerRef.current.removeLayer(playbackMarkerRef.current);
        playbackMarkerRef.current = null;
      }
      return;
    }

    const latlng: [number, number] = [playbackPoint.latitude, playbackPoint.longitude];
    const speedKmh = (playbackPoint as any).speed ? (playbackPoint as any).speed * 3.6 : 0;
    
    // Create or update playback marker
    const icon = L.divIcon({
      className: 'playback-marker',
      html: `
        <div style="
          width: 32px; height: 32px; 
          background: #3b82f6; border: 3px solid white; 
          border-radius: 50%; box-shadow: 0 0 15px rgba(0,0,0,0.3);
          display: flex; align-items: center; justify-content: center;
          color: white; transform: rotate(0deg); transition: transform 0.2s;
        ">
          ${speedKmh > 20 ? '🚗' : '🚶'}
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    if (playbackMarkerRef.current) {
      playbackMarkerRef.current.setLatLng(latlng);
      playbackMarkerRef.current.setIcon(icon);
    } else {
      playbackMarkerRef.current = L.marker(latlng, { icon, zIndexOffset: 2000 }).addTo(playbackLayerRef.current);
    }

    // Auto-center during playback if not too zoomed out
    if (mapRef.current.getZoom() > 12) {
      mapRef.current.panTo(latlng, { animate: true, duration: 0.5 });
    }
  }, [playbackPoint]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />
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
