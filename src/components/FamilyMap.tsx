import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';

const COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#14b8a6'];

function getFreshnessColor(timestamp: string): { dot: string; label: string } {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMin = diffMs / 60000;
  if (diffMin < 5) return { dot: '#22c55e', label: 'Online' };
  if (diffMin < 30) return { dot: '#f59e0b', label: 'Gần đây' };
  return { dot: '#ef4444', label: 'Offline' };
}

function createCustomIcon(initials: string, color: string, freshnessColor: string) {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="position:relative; width:40px; height:40px;">
        <div style="
          width: 40px; height: 40px; border-radius: 50%;
          background: ${color}; border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex; align-items: center; justify-content: center;
          color: white; font-weight: 600; font-size: 14px;
          font-family: system-ui, sans-serif;
        ">${initials}</div>
        <span style="
          position:absolute; bottom:-2px; right:-2px;
          width:12px; height:12px; border-radius:50%;
          background:${freshnessColor}; border:2px solid white;
        "></span>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -24],
  });
}

interface Props {
  members: FamilyMemberWithProfile[];
  flyTo: { lat: number; lng: number } | null;
  historyTrail?: Tables<'user_locations'>[];
  onMapClick?: (lat: number, lng: number) => void;
  showGeofences?: boolean;
  familyId?: string;
}

export default function FamilyMap({ members, flyTo, historyTrail, onMapClick, showGeofences, familyId }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const accuracyCirclesRef = useRef<Map<string, L.Circle>>(new Map());
  const historyLayerRef = useRef<L.LayerGroup | null>(null);
  const geofenceLayerRef = useRef<L.LayerGroup | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);

  const membersWithLocation = useMemo(() => members.filter((m) => m.location), [members]);

  const getInitials = (name: string) =>
    name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const defaultCenter: [number, number] = [10.8231, 106.6297];

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      center: defaultCenter,
      zoom: 13,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;
    markerLayerRef.current = L.layerGroup().addTo(map);
    historyLayerRef.current = L.layerGroup().addTo(map);
    geofenceLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      historyLayerRef.current = null;
      geofenceLayerRef.current = null;
      markersRef.current.clear();
      accuracyCirclesRef.current.clear();
    };
  }, []);

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
      const { data } = await supabase
        .from('geofences')
        .select('*')
        .eq('family_id', familyId);

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
            <p style="margin:2px 0 0; font-size:12px; color:#6b7280;">Bán kính: ${g.radius_meters}m</p>
          </div>
        `);

        geofenceLayerRef.current!.addLayer(circle);
      });
    };

    loadGeofences();
  }, [showGeofences, familyId]);

  // Update markers with smooth transitions
  useEffect(() => {
    if (!mapRef.current || !markerLayerRef.current) return;

    const existingIds = new Set(markersRef.current.keys());
    const currentIds = new Set(membersWithLocation.map((m) => m.user_id));

    // Remove markers for members no longer present
    for (const id of existingIds) {
      if (!currentIds.has(id)) {
        const marker = markersRef.current.get(id);
        if (marker) markerLayerRef.current.removeLayer(marker);
        markersRef.current.delete(id);

        const circle = accuracyCirclesRef.current.get(id);
        if (circle) markerLayerRef.current.removeLayer(circle);
        accuracyCirclesRef.current.delete(id);
      }
    }

    let hasFittedBounds = false;

    membersWithLocation.forEach((m, i) => {
      const loc = m.location!;
      const latlng: [number, number] = [loc.latitude, loc.longitude];
      const freshness = getFreshnessColor(loc.timestamp);
      const icon = createCustomIcon(
        getInitials(m.profile.display_name),
        COLORS[i % COLORS.length],
        freshness.dot
      );

      const popupContent = `
        <div style="text-align:center; min-width:120px;">
          <p style="margin:0; font-weight:600; font-size:14px;">${m.profile.display_name}</p>
          <p style="margin:4px 0 0; font-size:12px; color:${freshness.dot}; font-weight:500;">
            ● ${freshness.label}
          </p>
          <p style="margin:2px 0 0; font-size:12px; color:#6b7280;">
            ${formatDistanceToNow(new Date(loc.timestamp), { addSuffix: true, locale: vi })}
          </p>
          ${loc.accuracy ? `<p style="margin:2px 0 0; font-size:11px; color:#9ca3af;">±${Math.round(loc.accuracy)}m</p>` : ''}
        </div>
      `;

      const existingMarker = markersRef.current.get(m.user_id);
      if (existingMarker) {
        // Smooth transition: update position
        existingMarker.setLatLng(latlng);
        existingMarker.setIcon(icon);
        existingMarker.setPopupContent(popupContent);

        // Update accuracy circle
        const existingCircle = accuracyCirclesRef.current.get(m.user_id);
        if (loc.accuracy && loc.accuracy <= 100) {
          if (existingCircle) {
            existingCircle.setLatLng(latlng);
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
            markerLayerRef.current!.addLayer(circle);
            accuracyCirclesRef.current.set(m.user_id, circle);
          }
        } else if (existingCircle) {
          markerLayerRef.current!.removeLayer(existingCircle);
          accuracyCirclesRef.current.delete(m.user_id);
        }
      } else {
        // New marker
        const marker = L.marker(latlng, { icon });
        marker.bindPopup(popupContent);
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
          markerLayerRef.current!.addLayer(circle);
          accuracyCirclesRef.current.set(m.user_id, circle);
        }
      }
    });

    // Auto-fit bounds only on first load
    if (!hasFittedBounds && membersWithLocation.length > 0) {
      if (membersWithLocation.length > 1) {
        const bounds = L.latLngBounds(
          membersWithLocation.map((m) => [m.location!.latitude, m.location!.longitude] as [number, number])
        );
        mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } else {
        const loc = membersWithLocation[0].location!;
        mapRef.current.setView([loc.latitude, loc.longitude], 15);
      }
    }
  }, [membersWithLocation]);

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

    const polyline = L.polyline(latlngs, {
      color: '#3b82f6',
      weight: 3,
      opacity: 0.7,
      dashArray: '8 4',
    });
    historyLayerRef.current.addLayer(polyline);

    const startLoc = historyTrail[historyTrail.length - 1];
    L.circleMarker([startLoc.latitude, startLoc.longitude], {
      radius: 6, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 1,
    }).bindPopup(`Bắt đầu: ${new Date(startLoc.timestamp).toLocaleString('vi-VN')}`).addTo(historyLayerRef.current);

    const endLoc = historyTrail[0];
    L.circleMarker([endLoc.latitude, endLoc.longitude], {
      radius: 6, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1,
    }).bindPopup(`Kết thúc: ${new Date(endLoc.timestamp).toLocaleString('vi-VN')}`).addTo(historyLayerRef.current);

    mapRef.current.fitBounds(polyline.getBounds(), { padding: [50, 50] });
  }, [historyTrail]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
}
