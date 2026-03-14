import { useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFamily } from '@/hooks/useFamily';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { useRealtimeLocations } from '@/hooks/useRealtimeLocations';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useLanguage } from '@/contexts/LanguageContext';
import FamilySidebar from '@/components/FamilySidebar';
import FamilyMap from '@/components/FamilyMap';
import LocationHistory from '@/components/LocationHistory';
import GeofenceManager from '@/components/GeofenceManager';
import ProfileSettings from '@/components/ProfileSettings';
import GeofenceSettings from '@/components/GeofenceSettings';
import FamilyChat from '@/components/FamilyChat';
import FamilySetup from '@/pages/FamilySetup';
import LiveLocationToggle from '@/components/LiveLocationToggle';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Menu, History, Shield, MessageCircle, Bell } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import SOSButton from '@/components/SOSButton';
import { useSOSAlerts } from '@/hooks/useSOSAlerts';
import { useNotifications } from '@/hooks/useNotifications';
import { useLiveLocationSharing } from '@/hooks/useLiveLocationSharing';
import NotificationPanel from '@/components/NotificationPanel';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import PageTransition from '@/components/PageTransition';
import AnimatedPanel from '@/components/AnimatedPanel';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const DASHBOARD_TEXT = {
  vi: {
    loading: 'Đang tải...',
    tripTitle: 'Lịch sử di chuyển của',
    tripDesc: 'điểm trong 3 giờ qua',
    noDataTitle: 'Không có dữ liệu',
    noDataDesc: 'Chưa có lịch sử di chuyển gần đây',
    notifications: 'Thông báo',
    history: 'Lịch sử',
    geofence: 'Vùng',
    chat: 'Chat',
  },
  en: {
    loading: 'Loading...',
    tripTitle: 'Movement history of',
    tripDesc: 'points in the last 3 hours',
    noDataTitle: 'No data',
    noDataDesc: 'No recent movement history',
    notifications: 'Alerts',
    history: 'History',
    geofence: 'Zones',
    chat: 'Chat',
  },
};

export default function Dashboard() {
  const { signOut } = useAuth();
  const { language } = useLanguage();
  const text = DASHBOARD_TEXT[language];
  const { family, members, loading, refetch, updateMemberLocation } = useFamily();
  const { toast } = useToast();

  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set());
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

  useLocationTracking();
  usePushNotifications();
  useSOSAlerts();

  const {
    notifications,
    unreadCount: notifUnread,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllRead,
  } = useNotifications();
  const { sessions, mySession, startSharing, stopSharing, isSharing } = useLiveLocationSharing(family?.id);
  const liveSharingUserIds = useMemo(() => new Set(sessions.map((s) => s.user_id)), [sessions]);

  const handleRealtimeLocation = useCallback(
    (
      userId: string,
      lat: number,
      lng: number,
      accuracy: number | null,
      updatedAt: string,
      speed?: number | null,
      isMoving?: boolean | null,
      batteryLevel?: number | null
    ) => {
      updateMemberLocation(userId, lat, lng, accuracy, updatedAt, speed, isMoving, batteryLevel);
      setRecentlyUpdated((prev) => new Set(prev).add(userId));
      setTimeout(() => {
        setRecentlyUpdated((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }, 2000);
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

  const handleShowTrip = useCallback(
    async (member: FamilyMemberWithProfile) => {
      const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('user_locations')
        .select('*')
        .eq('user_id', member.user_id)
        .gte('timestamp', since)
        .order('timestamp', { ascending: false })
        .limit(500);

      if (data && data.length > 0) {
        setHistoryTrail(data);
        setShowHistory(true);

        if (member.location) {
          setFlyTo({ lat: member.location.latitude, lng: member.location.longitude });
        }

        toast({
          title: `${text.tripTitle} ${member.profile.display_name}`,
          description: `${data.length} ${text.tripDesc}`,
        });
      } else {
        toast({ title: text.noDataTitle, description: text.noDataDesc, variant: 'destructive' });
      }
      setMobileOpen(false);
    },
    [toast, text.tripDesc, text.tripTitle, text.noDataDesc, text.noDataTitle]
  );

  const handleCloseHistory = () => {
    setShowHistory(false);
    setHistoryTrail([]);
  };

  const handleMapClick = (lat: number, lng: number) => {
    if (showGeofences) {
      setPendingGeofenceLocation({ lat, lng });
    }
  };

  const toggleNotifications = () => {
    setShowNotifications((prev) => {
      const next = !prev;
      if (next) setShowChat(false);
      return next;
    });
  };

  const toggleHistory = () => {
    setShowHistory((prev) => {
      const next = !prev;
      if (next) {
        setShowGeofences(false);
      } else {
        setHistoryTrail([]);
      }
      return next;
    });
  };

  const toggleGeofences = () => {
    setShowGeofences((prev) => {
      const next = !prev;
      if (next) setShowHistory(false);
      return next;
    });
  };

  const toggleChat = () => {
    setShowChat((prev) => {
      const next = !prev;
      if (next) setShowNotifications(false);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse-gentle text-muted-foreground">{text.loading}</div>
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
      <PageTransition
        show={!exitingProfile}
        onExitComplete={() => {
          setShowProfile(false);
          setExitingProfile(false);
        }}
      >
        <ProfileSettings
          onBack={handleBackFromProfile}
          onOpenGeofenceSettings={() => {
            setShowProfile(false);
            setShowGeofenceSettings(true);
          }}
        />
      </PageTransition>
    );
  }

  if (showGeofenceSettings) {
    return (
      <PageTransition
        show={!exitingGeofence}
        onExitComplete={() => {
          setShowGeofenceSettings(false);
          setExitingGeofence(false);
        }}
      >
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
          onShowTrip={handleShowTrip}
          recentlyUpdated={recentlyUpdated}
          liveSharingUserIds={liveSharingUserIds}
          onMemberRemoved={refetch}
        />
      </div>

      {/* Mobile sidebar */}
      <div className="md:hidden absolute top-4 left-4 z-[1000]">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button size="icon" variant="secondary" className="shadow-lg rounded-full glass glass-dark h-11 w-11">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="p-0 w-72 data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left"
          >
            <FamilySidebar
              family={family}
              members={members}
              onMemberClick={handleMemberClick}
              onSignOut={signOut}
              onOpenProfile={() => {
                setShowProfile(true);
                setMobileOpen(false);
              }}
              onShowTrip={handleShowTrip}
              recentlyUpdated={recentlyUpdated}
              liveSharingUserIds={liveSharingUserIds}
              onMemberRemoved={refetch}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Top-right controls (desktop) */}
      <div className="absolute top-4 right-4 z-[1000] hidden md:flex flex-col gap-2">
        <div className="relative">
          <Button
            size="icon"
            variant={showNotifications ? 'default' : 'secondary'}
            className={cn('shadow-lg rounded-full transition-all duration-200', !showNotifications && 'glass glass-dark')}
            onClick={toggleNotifications}
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
          onClick={toggleHistory}
        >
          <History className="w-5 h-5" />
        </Button>
        <Button
          size="icon"
          variant={showGeofences ? 'default' : 'secondary'}
          className={cn('shadow-lg rounded-full transition-all duration-200', !showGeofences && 'glass glass-dark')}
          onClick={toggleGeofences}
        >
          <Shield className="w-5 h-5" />
        </Button>
      </div>

      {/* Notification panel */}
      <AnimatedPanel open={showNotifications} onClose={() => setShowNotifications(false)}>
        {(handleClose) => (
          <NotificationPanel
            notifications={notifications}
            onMarkAsRead={markAsRead}
            onMarkAllAsRead={markAllAsRead}
            onDelete={deleteNotification}
            onClearAllRead={clearAllRead}
            onClose={handleClose}
          />
        )}
      </AnimatedPanel>

      {/* Live location toggle */}
      <div className="absolute z-[1000] bottom-24 left-1/2 -translate-x-1/2 md:left-[calc(18rem+1rem)] md:bottom-6 md:translate-x-0">
        <div className="bg-card/90 backdrop-blur-sm rounded-xl shadow-lg p-2 border border-border/50">
          <LiveLocationToggle isSharing={isSharing} expiresAt={mySession?.expires_at} onStart={startSharing} onStop={stopSharing} />
        </div>
      </div>

      {/* Desktop bottom buttons */}
      <div className="absolute bottom-6 right-4 z-[1000] hidden md:flex flex-col gap-2 items-end">
        <SOSButton />
        <div className="relative">
          <Button
            size="icon"
            variant={showChat ? 'default' : 'secondary'}
            className={cn('shadow-lg w-12 h-12 rounded-full transition-all duration-200', !showChat && 'glass glass-dark')}
            onClick={toggleChat}
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

      {/* Mobile SOS */}
      <div className="md:hidden absolute bottom-24 right-4 z-[1000]">
        <SOSButton />
      </div>

      {/* Mobile quick actions */}
      <div className="md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] w-[calc(100%-1.5rem)]">
        <div className="glass glass-dark rounded-2xl border border-border/60 p-1.5 grid grid-cols-4 gap-1">
          <Button variant={showNotifications ? 'default' : 'ghost'} className="h-10 rounded-xl relative" onClick={toggleNotifications}>
            <Bell className="w-4 h-4" />
            {notifUnread > 0 && !showNotifications && (
              <Badge className="absolute -top-1 -right-1 h-4 min-w-[16px] p-0 text-[9px] bg-destructive text-destructive-foreground">
                {notifUnread > 9 ? '9+' : notifUnread}
              </Badge>
            )}
          </Button>
          <Button variant={showHistory ? 'default' : 'ghost'} className="h-10 rounded-xl" onClick={toggleHistory}>
            <History className="w-4 h-4" />
          </Button>
          <Button variant={showGeofences ? 'default' : 'ghost'} className="h-10 rounded-xl" onClick={toggleGeofences}>
            <Shield className="w-4 h-4" />
          </Button>
          <Button variant={showChat ? 'default' : 'ghost'} className="h-10 rounded-xl relative" onClick={toggleChat}>
            <MessageCircle className="w-4 h-4" />
            {unreadCount > 0 && !showChat && (
              <Badge className="absolute -top-1 -right-1 h-4 min-w-[16px] p-0 text-[9px] bg-destructive text-destructive-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
          </Button>
        </div>
        <div className="mt-1 text-center text-[10px] text-muted-foreground flex justify-between px-2">
          <span>{text.notifications}</span>
          <span>{text.history}</span>
          <span>{text.geofence}</span>
          <span>{text.chat}</span>
        </div>
      </div>

      {/* Chat */}
      <AnimatedPanel open={showChat} onClose={() => setShowChat(false)}>
        {(handleClose) => <FamilyChat familyId={family.id} members={members} onClose={handleClose} />}
      </AnimatedPanel>

      {/* Geofence manager */}
      <AnimatedPanel open={showGeofences} onClose={() => setShowGeofences(false)}>
        {(handleClose) => (
          <GeofenceManager
            onClose={handleClose}
            pendingLocation={pendingGeofenceLocation}
            onClearPending={() => setPendingGeofenceLocation(null)}
          />
        )}
      </AnimatedPanel>

      {/* Map */}
      <div className="flex-1 relative">
        <FamilyMap
          members={members}
          flyTo={flyTo}
          historyTrail={historyTrail}
          onMapClick={handleMapClick}
          showGeofences={showGeofences}
          familyId={family.id}
          liveSharingUserIds={liveSharingUserIds}
        />

        {showHistory && (
          <LocationHistory members={members} onHistoryLoaded={setHistoryTrail} onClose={handleCloseHistory} />
        )}
      </div>
    </div>
  );
}
