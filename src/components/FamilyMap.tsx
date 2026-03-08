import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

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
}

export default function FamilyMap({ members, flyTo }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const membersWithLocation = useMemo(() => members.filter((m) => m.location), [members]);

  const center: [number, number] = membersWithLocation.length > 0
    ? [membersWithLocation[0].location!.latitude, membersWithLocation[0].location!.longitude]
    : [10.8231, 106.6297];

  const getInitials = (name: string) =>
    name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      center,
      zoom: 13,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;
    markersLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, [center]);

  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

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

      marker.addTo(markersLayerRef.current!);
    });
  }, [membersWithLocation]);

  useEffect(() => {
    if (!mapRef.current || !flyTo) return;
    mapRef.current.flyTo([flyTo.lat, flyTo.lng], 16, { duration: 1 });
  }, [flyTo]);

  useEffect(() => {
    if (!mapRef.current || membersWithLocation.length === 0) return;
    const first = membersWithLocation[0].location!;
    mapRef.current.setView([first.latitude, first.longitude], mapRef.current.getZoom());
  }, [membersWithLocation]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
}

