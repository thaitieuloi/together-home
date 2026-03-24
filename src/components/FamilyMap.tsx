import GoogleFamilyMap from './GoogleFamilyMap';
import LeafletFamilyMap from './LeafletFamilyMap';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';

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

export default function FamilyMap(props: Props) {
  // Map engine configuration
  // Possible values: 'google' | 'leaflet'
  // Priority: 
  // 1. VITE_MAP_ENGINE env var
  // 2. Automatic fallback to leaflet if Google API Key is missing
  
  const googleApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const preferredEngine = import.meta.env.VITE_MAP_ENGINE || 'google';
  
  const engine = (preferredEngine === 'google' && googleApiKey) ? 'google' : 'leaflet';

  if (engine === 'google') {
    return <GoogleFamilyMap {...props} />;
  }

  return <LeafletFamilyMap {...props} />;
}
