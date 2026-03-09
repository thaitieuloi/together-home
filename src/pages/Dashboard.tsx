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
import GeofenceSettings from '@/components/GeofenceSettings';
import FamilyChat from '@/components/FamilyChat';
import FamilySetup from '@/pages/FamilySetup';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Menu, History, Shield, MessageCircle, Bell } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import SOSButton from '@/components/SOSButton';
import { useSOSAlerts } from '@/hooks/useSOSAlerts';
import { useNotifications } from '@/hooks/useNotifications';
import NotificationPanel from '@/components/NotificationPanel';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import PageTransition from '@/components/PageTransition';
import AnimatedPanel from '@/components/AnimatedPanel';

export default function Dashboard() {
  const { signOut } = useAuth();
  const { family, members, loading, refetch, updateMemberLocation } = useFamily();
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showGeofences, setShowGeofences] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showGeofenceSettings, setShowGeofenceSettings] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [historyTrail, setHistoryTrail] = useState<Tables<'user_locations'>[]>([]);
  const [pendingGeofenceLocation, setPendingGeofenceLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [exitingProfile, setExitingProfile] = useState(false);
  const [exitingGeofence, setExitingGeofence] = useState(false);

  // Panel exit states
  const [chatMounted, setChatMounted] = useState(false);
  const [chatVisible, setChatVisible] = useState(true);
  const [notifMounted, setNotifMounted] = useState(false);
  const [notifVisible, setNotifVisible] = useState(true);
  const [geoMounted, setGeoMounted] = useState(false);
  const [geoVisible, setGeoVisible] = useState(true);

  useLocationTracking();
  usePushNotifications();
  useSOSAlerts();
  const { notifications, unreadCount: notifUnread, markAsRead, markAllAsRead, deleteNotification, clearAllRead } = useNotifications();

  const handleRealtimeLocation = useCallback(
    (userId: string, lat: number, lng: number, accuracy: number | null, updatedAt: string) => {
      updateMemberLocation(userId, lat, lng, accuracy, updatedAt);
    },
    [updateMemberLocation]
  );
  useRealtimeLocations(members, handleRealtimeLocation);

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
        <div className="animate-pulse-gentle text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  if (!family) {
    return <FamilySetup />;
  }


  const handleBackFromProfile = () => {
    setExitingProfile(true);
  };

  const handleBackFromGeofence = () => {
    setExitingGeofence(true);
  };

  if (showProfile) {
    return (
      <PageTransition show={!exitingProfile} onExitComplete={() => { setShowProfile(false); setExitingProfile(false); }}>
        <ProfileSettings onBack={handleBackFromProfile} onOpenGeofenceSettings={() => { setShowProfile(false); setShowGeofenceSettings(true); }} />
      </PageTransition>
    );
  }

  if (showGeofenceSettings) {
    return (
      <PageTransition show={!exitingGeofence} onExitComplete={() => { setShowGeofenceSettings(false); setExitingGeofence(false); }}>
        <GeofenceSettings onBack={handleBackFromGeofence} />
      </PageTransition>
    );
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
            <Button size="icon" variant="secondary" className="shadow-lg rounded-full glass glass-dark">
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
        <div className="relative">
          <Button
            size="icon"
            variant={showNotifications ? 'default' : 'secondary'}
            className={cn('shadow-lg rounded-full transition-all duration-200', !showNotifications && 'glass glass-dark')}
            onClick={() => {
              if (notifMounted) { setNotifVisible(false); }
              else { setNotifMounted(true); setNotifVisible(true); setShowNotifications(true); }
            }}
          >
            <Bell className="w-5 h-5" />
          </Button>
          {notifUnread > 0 && !showNotifications && (
            <Badge className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] flex items-center justify-center p-0 text-[10px] bg-destructive text-destructive-foreground border-2 border-background rounded-full animate-scale-in">
              {notifUnread > 99 ? '99+' : notifUnread}
            </Badge>
          )}
        </div>
        <Button
          size="icon"
          variant={showHistory ? 'default' : 'secondary'}
          className={cn('shadow-lg rounded-full transition-all duration-200', !showHistory && 'glass glass-dark')}
          onClick={() => showHistory ? handleCloseHistory() : setShowHistory(true)}
        >
          <History className="w-5 h-5" />
        </Button>
        <Button
          size="icon"
          variant={showGeofences ? 'default' : 'secondary'}
          className={cn('shadow-lg rounded-full transition-all duration-200', !showGeofences && 'glass glass-dark')}
          onClick={() => setShowGeofences(!showGeofences)}
        >
          <Shield className="w-5 h-5" />
        </Button>
      </div>

      {/* Notification panel */}
      {showNotifications && (
        <NotificationPanel
          notifications={notifications}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onDelete={deleteNotification}
          onClearAllRead={clearAllRead}
          onClose={() => setShowNotifications(false)}
        />
      )}

      {/* Bottom buttons */}
      <div className="absolute bottom-6 right-4 z-[1000] flex flex-col gap-2 items-end">
        <SOSButton />
        <div className="relative">
          <Button
            size="icon"
            variant={showChat ? 'default' : 'secondary'}
            className={cn('shadow-lg w-12 h-12 rounded-full transition-all duration-200', !showChat && 'glass glass-dark')}
            onClick={() => setShowChat(!showChat)}
          >
            <MessageCircle className="w-5 h-5" />
          </Button>
          {unreadCount > 0 && !showChat && (
            <Badge className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] flex items-center justify-center p-0 text-[10px] bg-destructive text-destructive-foreground border-2 border-background rounded-full animate-scale-in">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </div>
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
          familyId={family.id}
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
