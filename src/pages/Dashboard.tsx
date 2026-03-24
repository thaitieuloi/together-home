import { useState, useEffect, useCallback, useMemo } from 'react';
import { App } from '@capacitor/app';
import { useNavigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/hooks/useAuth';
import { useFamily } from '@/hooks/useFamily';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { useRealtimeLocations } from '@/hooks/useRealtimeLocations';
import { useRealtimeProfiles } from '@/hooks/useRealtimeProfiles';
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
import MemberActionSheet from '@/components/MemberActionSheet';
import Onboarding from '@/components/Onboarding';
import FamilySetup from '@/pages/FamilySetup';
// Removed LiveLocationToggle as background tracking is always active
import FamilyAdmin from '@/components/FamilyAdmin';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Menu, History, Shield, MessageCircle, Bell, Bug } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import SOSButton from '@/components/SOSButton';
import { useSOSAlerts } from '@/hooks/useSOSAlerts';
import { useNotifications } from '@/hooks/useNotifications';
import { useLiveLocationSharing } from '@/hooks/useLiveLocationSharing';
import NotificationPanel from '@/components/NotificationPanel';
import DebugTrackingPanel from '@/components/DebugTrackingPanel';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import PageTransition from '@/components/PageTransition';
import AnimatedPanel from '@/components/AnimatedPanel';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useActiveSOSAlerts } from '@/hooks/useActiveSOSAlerts';

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
  const { user, signOut } = useAuth();
  const { language } = useLanguage();
  const text = DASHBOARD_TEXT[language];
  const navigate = useNavigate();
  const location = useLocation();
  const { family, members, loading, updateMemberLocation, updateMemberProfile, refetch } = useFamily();
  const { toast } = useToast();

  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set());
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showGeofences, setShowGeofences] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showFamilyAdmin, setShowFamilyAdmin] = useState(false);
  const [showGeofenceSettings, setShowGeofenceSettings] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [historyTrail, setHistoryTrail] = useState<Tables<'user_locations'>[]>([]);
  const [pendingGeofenceLocation, setPendingGeofenceLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [exitingProfile, setExitingProfile] = useState(false);
  const [exitingFamilyAdmin, setExitingFamilyAdmin] = useState(false);
  const [exitingGeofence, setExitingGeofence] = useState(false);
  const [selectedMember, setSelectedMember] = useState<FamilyMemberWithProfile | null>(null);
  const [showMemberSheet, setShowMemberSheet] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('onboarding_done'));
  const [showDebug, setShowDebug] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [playbackPoint, setPlaybackPoint] = useState<Tables<'user_locations'> | null>(null);
  const [selectedMemberForHistoryId, setSelectedMemberForHistoryId] = useState<string | undefined>(undefined);

  useLocationTracking();
  usePushNotifications();
  useSOSAlerts();
  const activeSOSUserIds = useActiveSOSAlerts();

  const {
    notifications,
    unreadCount: notifUnread,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllRead,
  } = useNotifications();
  // Removed high-frequency live sessions to avoid confusion; constant background tracking is always active
  const liveSharingUserIds = useMemo(() => new Set<string>(), []);

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
      // Log for Debug Tracking Panel visibility
      const member = members.find(m => m.user_id === userId);
      const name = member?.profile.display_name || userId;
      console.info(`[LocationTracking] Realtime update from ${name}`, {
        userId,
        lat,
        lng,
        accuracy,
        speed,
        isMoving,
        batteryLevel,
        updatedAt
      });

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
    [updateMemberLocation, members]
  );

  useRealtimeLocations(members, handleRealtimeLocation);
  useRealtimeProfiles(members, updateMemberProfile);

  const { unreadCount } = useUnreadMessages(family?.id, showChat);

  const handleMemberClick = (member: FamilyMemberWithProfile) => {
    const isSameMember = selectedMember?.user_id === member.user_id;
    
    setSelectedMember(member);
    setShowMemberSheet(true);
    setMobileOpen(false);

    if (!isSameMember) {
      // Only close everything if switching to a DIFFERENT member
      setShowChat(false);
      setShowNotifications(false);
      setShowGeofences(false);
      setShowDebug(false);
      handleCloseHistory();
    }
  };

  const handleFlyToMember = (member: FamilyMemberWithProfile) => {
    if (!member.location) return;
    setFlyTo({ lat: member.location.latitude, lng: member.location.longitude });
    setShowMemberSheet(false);
  };

  const handleMessageMember = (_member: FamilyMemberWithProfile) => {
    setShowChat(true);
    setShowMemberSheet(false);
    navigate('/chat');
  };

  const handleShowMemberHistory = (member: FamilyMemberWithProfile) => {
    setSelectedMemberForHistoryId(member.user_id);
    setShowHistory(true);
    setShowMemberSheet(false);
    navigate('/history');
    if (member.location) {
      setFlyTo({ lat: member.location.latitude, lng: member.location.longitude });
    }
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
        .limit(2000);

      if (data && data.length > 0) {
        setHistoryTrail(data);
        setSelectedMemberForHistoryId(member.user_id);
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
    setPlaybackPoint(null);
    setSelectedMemberForHistoryId(undefined);
    navigate('/dashboard');
  };

  useEffect(() => {
    // Initial panel based on route
    if (location.pathname === '/profile') setShowProfile(true);
    if (location.pathname === '/family-admin') setShowFamilyAdmin(true);
    if (location.pathname === '/geofences') setShowGeofences(true);
    if (location.pathname === '/history') setShowHistory(true);
    if (location.pathname === '/chat') setShowChat(true);
  }, [location.pathname]);

  // Status tracking (Online/Idle/Offline)
  useEffect(() => {
    if (!user) return;

    const updateStatus = async (status: 'online' | 'idle' | 'offline') => {
      try {
        await supabase
          .from('profiles')
          .update({ 
            status,
            updated_at: new Date().toISOString()
          } as any)
          .eq('user_id', user.id);
      } catch (err) {
        console.error('Failed to update status:', err);
      }
    };

    // Mark as online when first entering the dashboard
    updateStatus('online');

    const handleFocus = () => {
      console.log('📡 [Status] App focused');
      updateStatus('online');
    };
    const handleBlur = () => {
      console.log('📡 [Status] App blurred');
      updateStatus('idle');
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Capacitor handle background/foreground natively
    let appStateListener: any;
    if (Capacitor.isNativePlatform()) {
      appStateListener = App.addListener('appStateChange', ({ isActive }) => {
        console.log(`📡 [Status] Native App State Change: ${isActive ? 'active' : 'inactive'}`);
        if (isActive) {
          updateStatus('online');
        } else {
          updateStatus('offline'); // Changed to offline for consistency
        }
      });
    }

    return () => {
      updateStatus('offline');
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      if (appStateListener) {
        appStateListener.remove();
      }
    };
  }, [user]);

  const handleMapClick = (lat: number, lng: number) => {
    if (showGeofences) {
      setPendingGeofenceLocation({ lat, lng });
    }
  };

  const toggleNotifications = () => {
    setShowNotifications((prev) => {
      const next = !prev;
      if (next) {
        setShowChat(false);
        setShowMemberSheet(false);
        setShowGeofences(false);
        setShowDebug(false);
        handleCloseHistory();
        navigate('/dashboard');
      }
      return next;
    });
  };

  const toggleHistory = () => {
    setShowHistory((prev) => {
      const next = !prev;
      if (next) {
        setShowGeofences(false);
        setShowMemberSheet(false);
        setShowChat(false);
        setShowNotifications(false);
        setShowDebug(false);
        navigate('/history');
      } else {
        setHistoryTrail([]);
        navigate('/dashboard');
      }
      return next;
    });
  };

  const toggleGeofences = () => {
    setShowGeofences((prev) => {
      const next = !prev;
      if (next) {
        setShowHistory(false);
        setShowMemberSheet(false);
        setShowChat(false);
        setShowNotifications(false);
        setShowDebug(false);
        navigate('/geofences');
      } else {
        navigate('/dashboard');
      }
      return next;
    });
  };

  const toggleChat = () => {
    setShowChat((prev) => {
      const next = !prev;
      if (next) {
        setShowNotifications(false);
        setShowMemberSheet(false);
        setShowHistory(false);
        setShowGeofences(false);
        setShowDebug(false);
        navigate('/chat');
      } else {
        navigate('/dashboard');
      }
      return next;
    });
  };

  const toggleDebug = () => {
    setShowDebug((prev) => {
      const next = !prev;
      if (next) {
        setShowChat(false);
        setShowNotifications(false);
        setShowMemberSheet(false);
        setShowHistory(false);
        setShowGeofences(false);
      }
      return next;
    });
  };

  const handleRefreshLocations = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  }, [refetch]);

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
    navigate('/dashboard');
  };

  const handleBackFromGeofence = () => {
    setExitingGeofence(true);
    navigate('/dashboard');
  };

  const handleBackFromFamilyAdmin = () => {
    setExitingFamilyAdmin(true);
    navigate('/dashboard');
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

  if (showFamilyAdmin) {
    return (
      <PageTransition
        show={!exitingFamilyAdmin}
        onExitComplete={() => {
          setShowFamilyAdmin(false);
          setExitingFamilyAdmin(false);
        }}
      >
        <FamilyAdmin onBack={handleBackFromFamilyAdmin} />
      </PageTransition>
    );
  }

  return (
    <>
    <div className="flex h-screen w-full overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex relative z-10">
        <FamilySidebar
          family={family}
          members={members}
          onMemberClick={handleMemberClick}
          onSignOut={signOut}
          onOpenProfile={() => { navigate('/profile'); setShowProfile(true); }}
          onOpenFamilyAdmin={() => { navigate('/family-admin'); setShowFamilyAdmin(true); }}
          onShowTrip={handleShowTrip}
          recentlyUpdated={recentlyUpdated}
          liveSharingUserIds={liveSharingUserIds}
          onMemberRemoved={refetch}
          activeSOSUserIds={activeSOSUserIds}
          selectedMemberId={showMemberSheet ? selectedMember?.user_id : (showHistory ? selectedMemberForHistoryId : (showChat ? selectedMember?.user_id : undefined))}
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
                navigate('/profile');
                setShowProfile(true);
                setMobileOpen(false);
              }}
              onOpenFamilyAdmin={() => {
                navigate('/family-admin');
                setShowFamilyAdmin(true);
                setMobileOpen(false);
              }}
              onShowTrip={handleShowTrip}
              recentlyUpdated={recentlyUpdated}
              liveSharingUserIds={liveSharingUserIds}
              onMemberRemoved={refetch}
              activeSOSUserIds={activeSOSUserIds}
              selectedMemberId={showMemberSheet ? selectedMember?.user_id : (showHistory ? selectedMemberForHistoryId : (showChat ? selectedMember?.user_id : undefined))}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Top-right controls (desktop) */}
      <div className={cn(
        "absolute top-6 z-[1000] hidden md:flex flex-col gap-3 transition-all duration-500 ease-in-out",
        showHistory ? "right-[444px]" : "right-6"
      )}>
        <div className="relative">
          <Button
            size="icon"
            variant={showNotifications ? 'default' : 'secondary'}
            className={cn(
              'shadow-2xl w-12 h-12 rounded-full transition-all duration-300 hover:scale-110 active:scale-95 border border-white/10',
              !showNotifications ? 'glass glass-dark' : 'bg-primary border-primary shadow-primary/20'
            )}
            onClick={toggleNotifications}
          >
            <Bell className="w-5 h-5" />
          </Button>
          {notifUnread > 0 && !showNotifications && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-[20px] flex items-center justify-center p-0 text-[9px] font-black bg-destructive text-destructive-foreground border-2 border-background rounded-full animate-scale-in">
              {notifUnread > 99 ? '99+' : notifUnread}
            </Badge>
          )}
        </div>
        <Button
          size="icon"
          variant={showHistory ? 'default' : 'secondary'}
          className={cn(
            'shadow-2xl w-12 h-12 rounded-full transition-all duration-300 hover:scale-110 active:scale-95 border border-white/10',
            !showHistory ? 'glass glass-dark' : 'bg-primary border-primary shadow-primary/20'
          )}
          onClick={toggleHistory}
        >
          <History className="w-5 h-5" />
        </Button>
        <Button
          size="icon"
          variant={showGeofences ? 'default' : 'secondary'}
          className={cn(
            'shadow-2xl w-12 h-12 rounded-full transition-all duration-300 hover:scale-110 active:scale-95 border border-white/10',
            !showGeofences ? 'glass glass-dark' : 'bg-primary border-primary shadow-primary/20'
          )}
          onClick={toggleGeofences}
        >
          <Shield className="w-5 h-5" />
        </Button>
        <Button
          size="icon"
          variant={showDebug ? 'default' : 'secondary'}
          className={cn(
            'shadow-2xl w-12 h-12 rounded-full transition-all duration-300 hover:scale-110 active:scale-95 border border-white/10',
            !showDebug ? 'glass glass-dark' : 'bg-primary border-primary shadow-primary/20'
          )}
          onClick={toggleDebug}
        >
          <Bug className="w-5 h-5" />
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
            isHistoryOpen={showHistory}
          />
        )}
      </AnimatedPanel>

      {/* Removed high-frequency LiveLocationToggle to simplify data flow - background tracking is always active */}

      {/* Desktop bottom buttons */}
      <div className="absolute bottom-10 right-6 z-[1000] hidden md:flex flex-col gap-3 items-end">
        <SOSButton />
        <div className="relative">
          <Button
            size="icon"
            variant={showChat ? 'default' : 'secondary'}
            className={cn(
               'shadow-2xl w-14 h-14 rounded-full transition-all duration-300 hover:scale-110 active:scale-95 border border-white/10',
               !showChat ? 'glass glass-dark' : 'bg-primary border-primary shadow-primary/20'
            )}
            onClick={toggleChat}
          >
            <MessageCircle className="w-6 h-6" />
          </Button>
          {unreadCount > 0 && !showChat && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-[22px] flex items-center justify-center p-0 text-[9px] font-black bg-destructive text-destructive-foreground border-2 border-background rounded-full animate-scale-in">
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
        <div className="glass glass-dark rounded-2xl border border-border/60 p-1.5 grid grid-cols-5 gap-1">
          <Button variant={showNotifications ? 'default' : 'ghost'} className="h-10 rounded-xl relative" onClick={toggleNotifications}>
            <Bell className="w-4 h-4" />
            {notifUnread > 0 && !showNotifications && (
              <Badge className="absolute -top-1 -right-1 h-4 min-w-[16px] p-0 text-[9px] bg-destructive text-destructive-foreground">
                {notifUnread > 9 ? '9+' : notifUnread}
              </Badge>
            )}
          </Button>
          <Button variant={showHistory ? 'default' : 'ghost'} className="h-10 rounded-xl" onClick={() => { toggleHistory(); navigate(showHistory ? '/dashboard' : '/history'); }}>
            <History className="w-4 h-4" />
          </Button>
          <Button variant={showGeofences ? 'default' : 'ghost'} className="h-10 rounded-xl" onClick={toggleGeofences}>
            <Shield className="w-4 h-4" />
          </Button>
          <Button variant={showChat ? 'default' : 'ghost'} className="h-10 rounded-xl relative" onClick={() => { toggleChat(); navigate(showChat ? '/dashboard' : '/chat'); }}>
            <MessageCircle className="w-4 h-4" />
            {unreadCount > 0 && !showChat && (
              <Badge className="absolute -top-1 -right-1 h-4 min-w-[16px] p-0 text-[10px] bg-destructive text-destructive-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
          </Button>
          <Button variant={showDebug ? 'default' : 'ghost'} className="h-10 rounded-xl" onClick={toggleDebug}>
            <Bug className="w-4 h-4" />
          </Button>
        </div>
        <div className="mt-1.5 px-3 flex justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
          <span className="w-10 text-center">{text.notifications}</span>
          <span className="w-10 text-center">{text.history}</span>
          <span className="w-10 text-center">{text.geofence}</span>
          <span className="w-10 text-center">{text.chat}</span>
          <span className="w-10 text-center uppercase">Logs</span>
        </div>
      </div>

      {/* Member Action Sheet */}
      <MemberActionSheet
        member={selectedMember}
        open={showMemberSheet}
        onClose={() => setShowMemberSheet(false)}
        onNavigate={handleFlyToMember}
        onMessage={handleMessageMember}
        onViewHistory={handleShowMemberHistory}
        onUpdate={refetch}
        isAdmin={members.find((m) => m.user_id === user?.id)?.role === 'admin'}
        isSOS={selectedMember ? activeSOSUserIds.has(selectedMember.user_id) : false}
      />

      <AnimatedPanel open={showChat} onClose={() => setShowChat(false)}>
        {(handleClose) => <FamilyChat familyId={family.id} members={members} onClose={handleClose} isHistoryOpen={showHistory} />}
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

      {/* Map - FULL SCREEN */}
      <div className="absolute inset-0 z-0">
        <FamilyMap
          members={members}
          flyTo={flyTo}
          historyTrail={historyTrail}
          playbackPoint={playbackPoint}
          onMapClick={handleMapClick}
          onMemberClick={handleMemberClick}
          showGeofences={showGeofences}
          familyId={family.id}
          liveSharingUserIds={liveSharingUserIds}
          onRefresh={handleRefreshLocations}
          isRefreshing={isRefreshing}
        />

        {showHistory && (
          <LocationHistory
            members={members}
            initialMemberId={selectedMemberForHistoryId}
            onHistoryLoaded={(trail, _mode) => setHistoryTrail(trail)}
            onPlaybackChange={setPlaybackPoint}
            onClose={handleCloseHistory}
          />
        )}
      </div>

      {/* Debug Tracking Panel */}
      <AnimatedPanel open={showDebug} onClose={() => setShowDebug(false)}>
        {(handleClose) => <DebugTrackingPanel onClose={handleClose} />}
      </AnimatedPanel>
    </div>
    {showOnboarding && (
      <Onboarding onDone={() => setShowOnboarding(false)} />
    )}
    </>
  );
}
