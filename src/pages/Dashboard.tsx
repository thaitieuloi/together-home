import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFamily } from '@/hooks/useFamily';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { useRealtimeLocations } from '@/hooks/useRealtimeLocations';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import FamilySidebar from '@/components/FamilySidebar';
import FamilyMap from '@/components/FamilyMap';
import LocationHistory from '@/components/LocationHistory';
import GeofenceManager from '@/components/GeofenceManager';
import ProfileSettings from '@/components/ProfileSettings';
import FamilyChat from '@/components/FamilyChat';
import FamilySetup from '@/pages/FamilySetup';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Menu, History, Shield, MessageCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import SOSButton from '@/components/SOSButton';
import { useSOSAlerts } from '@/hooks/useSOSAlerts';
import { Badge } from '@/components/ui/badge';

export default function Dashboard() {
  const { signOut } = useAuth();
  const { family, members, loading, refetch } = useFamily();
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showGeofences, setShowGeofences] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [historyTrail, setHistoryTrail] = useState<Tables<'user_locations'>[]>([]);
  const [pendingGeofenceLocation, setPendingGeofenceLocation] = useState<{ lat: number; lng: number } | null>(null);

  useLocationTracking();
  usePushNotifications();
  useSOSAlerts();
  useRealtimeLocations(members, useCallback(() => refetch(), [refetch]));
  const { unreadCount } = useUnreadMessages(family?.id, showChat);

  const handleMemberClick = (member: FamilyMemberWithProfile) => {
    if (member.location) {
      setFlyTo({ lat: member.location.latitude, lng: member.location.longitude });
    }
    setMobileOpen(false);
  };

  const handleCloseHistory = () => {
    setShowHistory(false);
    setHistoryTrail([]);
  };

  const handleMapClick = (lat: number, lng: number) => {
    if (showGeofences) {
      setPendingGeofenceLocation({ lat, lng });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  if (!family) {
    return <FamilySetup />;
  }

  if (showProfile) {
    return <ProfileSettings onBack={() => setShowProfile(false)} />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <FamilySidebar
          family={family}
          members={members}
          onMemberClick={handleMemberClick}
          onSignOut={signOut}
          onOpenProfile={() => setShowProfile(true)}
        />
      </div>

      {/* Mobile sidebar */}
      <div className="md:hidden absolute top-4 left-4 z-[1000]">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button size="icon" variant="secondary" className="shadow-lg">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72">
            <FamilySidebar
              family={family}
              members={members}
              onMemberClick={handleMemberClick}
              onSignOut={signOut}
              onOpenProfile={() => { setShowProfile(true); setMobileOpen(false); }}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
        <Button
          size="icon"
          variant={showHistory ? 'default' : 'secondary'}
          className="shadow-lg"
          onClick={() => showHistory ? handleCloseHistory() : setShowHistory(true)}
        >
          <History className="w-5 h-5" />
        </Button>
        <Button
          size="icon"
          variant={showGeofences ? 'default' : 'secondary'}
          className="shadow-lg"
          onClick={() => setShowGeofences(!showGeofences)}
        >
          <Shield className="w-5 h-5" />
        </Button>
      </div>

      {/* Bottom buttons */}
      <div className="absolute bottom-6 right-4 z-[1000] flex flex-col gap-2 items-end">
        <SOSButton />
        <Button
          size="icon"
          variant={showChat ? 'default' : 'secondary'}
          className="shadow-lg w-12 h-12 rounded-full"
          onClick={() => setShowChat(!showChat)}
        >
          <MessageCircle className="w-5 h-5" />
        </Button>
      </div>

      {/* Chat */}
      {showChat && (
        <FamilyChat
          familyId={family.id}
          members={members}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* Geofence manager */}
      {showGeofences && (
        <GeofenceManager
          onClose={() => setShowGeofences(false)}
          pendingLocation={pendingGeofenceLocation}
          onClearPending={() => setPendingGeofenceLocation(null)}
        />
      )}

      {/* Map */}
      <div className="flex-1 relative">
        <FamilyMap
          members={members}
          flyTo={flyTo}
          historyTrail={historyTrail}
          onMapClick={handleMapClick}
          showGeofences={showGeofences}
        />

        {showHistory && (
          <LocationHistory
            members={members}
            onHistoryLoaded={setHistoryTrail}
            onClose={handleCloseHistory}
          />
        )}
      </div>
    </div>
  );
}
