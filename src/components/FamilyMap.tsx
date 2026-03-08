import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useFamily } from '@/hooks/useFamily';

const COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#14b8a6'];

function createCustomIcon(initials: string, color: string) {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 40px; height: 40px; border-radius: 50%;
        background: ${color}; border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
        color: white; font-weight: 600; font-size: 14px;
        font-family: system-ui, sans-serif;
      ">${initials}</div>
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
}

export default function FamilyMap({ members, flyTo, historyTrail, onMapClick, showGeofences }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const historyLayerRef = useRef<L.LayerGroup | null>(null);
  const geofenceLayerRef = useRef<L.LayerGroup | null>(null);
  const { family } = useFamily();

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
    clusterGroupRef.current = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });
    map.addLayer(clusterGroupRef.current);
    historyLayerRef.current = L.layerGroup().addTo(map);
    geofenceLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      clusterGroupRef.current = null;
      historyLayerRef.current = null;
      geofenceLayerRef.current = null;
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

    if (!showGeofences || !family) return;

    const loadGeofences = async () => {
      const { data } = await supabase
        .from('geofences')
        .select('*')
        .eq('family_id', family.id);

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
  }, [showGeofences, family]);

  // Update markers + auto-fit bounds
  useEffect(() => {
    if (!mapRef.current || !clusterGroupRef.current) return;

    clusterGroupRef.current.clearLayers();

    membersWithLocation.forEach((m, i) => {
      const marker = L.marker(
        [m.location!.latitude, m.location!.longitude],
        { icon: createCustomIcon(getInitials(m.profile.display_name), COLORS[i % COLORS.length]) }
      );

      marker.bindPopup(`
        <div style="text-align:center; min-width:120px;">
          <p style="margin:0; font-weight:600; font-size:14px;">${m.profile.display_name}</p>
          <p style="margin:4px 0 0; font-size:12px; color:#6b7280;">
            ${formatDistanceToNow(new Date(m.location!.timestamp), { addSuffix: true, locale: vi })}
          </p>
          <p style="margin:2px 0 0; font-size:12px; color:#9ca3af;">
            ${m.location!.latitude.toFixed(5)}, ${m.location!.longitude.toFixed(5)}
          </p>
        </div>
      `);

      clusterGroupRef.current!.addLayer(marker);
    });

    // Auto-fit bounds
    if (membersWithLocation.length > 1) {
      const bounds = L.latLngBounds(
        membersWithLocation.map((m) => [m.location!.latitude, m.location!.longitude] as [number, number])
      );
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } else if (membersWithLocation.length === 1) {
      const loc = membersWithLocation[0].location!;
      mapRef.current.setView([loc.latitude, loc.longitude], 15);
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
