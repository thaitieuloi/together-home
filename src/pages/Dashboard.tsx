import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFamily } from '@/hooks/useFamily';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { useRealtimeLocations } from '@/hooks/useRealtimeLocations';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import FamilySidebar from '@/components/FamilySidebar';
import FamilyMap from '@/components/FamilyMap';
import LocationHistory from '@/components/LocationHistory';
import FamilySetup from '@/pages/FamilySetup';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Menu, History } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

export default function Dashboard() {
  const { signOut } = useAuth();
  const { family, members, loading, refetch } = useFamily();
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyTrail, setHistoryTrail] = useState<Tables<'user_locations'>[]>([]);

  useLocationTracking();
  usePushNotifications();
  useRealtimeLocations(members, useCallback(() => refetch(), [refetch]));

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

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <FamilySidebar
          family={family}
          members={members}
          onMemberClick={handleMemberClick}
          onSignOut={signOut}
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
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* History toggle button */}
      <div className="absolute top-4 right-4 z-[1000]">
        <Button
          size="icon"
          variant={showHistory ? 'default' : 'secondary'}
          className="shadow-lg"
          onClick={() => showHistory ? handleCloseHistory() : setShowHistory(true)}
        >
          <History className="w-5 h-5" />
        </Button>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <FamilyMap members={members} flyTo={flyTo} historyTrail={historyTrail} />

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
