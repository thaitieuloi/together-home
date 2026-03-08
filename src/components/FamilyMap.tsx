import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

// Fix Leaflet default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

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

function FlyToMember({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], 16, { duration: 1 });
    }
  }, [target, map]);
  return null;
}

interface Props {
  members: FamilyMemberWithProfile[];
  flyTo: { lat: number; lng: number } | null;
}

export default function FamilyMap({ members, flyTo }: Props) {
  const membersWithLocation = members.filter((m) => m.location);

  const center: [number, number] = membersWithLocation.length > 0
    ? [membersWithLocation[0].location!.latitude, membersWithLocation[0].location!.longitude]
    : [10.8231, 106.6297]; // Default: Ho Chi Minh City

  const getInitials = (name: string) =>
    name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <MapContainer center={center} zoom={13} className="w-full h-full" zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyToMember target={flyTo} />
      {membersWithLocation.map((m, i) => (
        <Marker
          key={m.user_id}
          position={[m.location!.latitude, m.location!.longitude]}
          icon={createCustomIcon(getInitials(m.profile.display_name), COLORS[i % COLORS.length])}
        >
          <Popup>
            <div className="text-center min-w-[120px]">
              <p className="font-semibold text-sm">{m.profile.display_name}</p>
              <p className="text-xs text-gray-500 mt-1">
                {formatDistanceToNow(new Date(m.location!.timestamp), { addSuffix: true, locale: vi })}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {m.location!.latitude.toFixed(5)}, {m.location!.longitude.toFixed(5)}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
