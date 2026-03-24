import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { reverseGeocode } from '@/lib/geocoding';

const COUNTDOWN_SECONDS = 5;

type Phase = 'idle' | 'countdown' | 'sending';

export default function SOSButton() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearCountdownInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const triggerHaptic = () => {
    if (navigator.vibrate) navigator.vibrate([100, 50, 200]);
  };

  const sendSOS = useCallback(async () => {
    if (!user) return;
    triggerHaptic();
    setPhase('sending');

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        })
      );

      const { latitude, longitude } = position.coords;

      const { error } = await supabase.from('sos_alerts').insert({
        user_id: user.id,
        latitude,
        longitude,
      });

      if (error) throw error;

      const address = await reverseGeocode(latitude, longitude);
      await supabase.functions.invoke('send-sos-notification', {
        body: { latitude, longitude, address },
      });

      toast({
        title: '🆘 Đã gửi SOS!',
        description: 'Tất cả thành viên gia đình đã được thông báo.',
      });
    } catch (err: any) {
      toast({
        title: 'Lỗi gửi SOS',
        description: err.message || 'Không thể gửi tín hiệu SOS',
        variant: 'destructive',
      });
    } finally {
      setPhase('idle');
      setCountdown(COUNTDOWN_SECONDS);
    }
  }, [user, toast]);

  const handlePress = () => {
    if (phase !== 'idle') return;
    triggerHaptic();
    setCountdown(COUNTDOWN_SECONDS);
    setPhase('countdown');
  };

  const handleCancel = () => {
    clearCountdownInterval();
    setPhase('idle');
    setCountdown(COUNTDOWN_SECONDS);
  };

  useEffect(() => {
    if (phase !== 'countdown') return;

    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearCountdownInterval();
          sendSOS();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearCountdownInterval();
  }, [phase, sendSOS, clearCountdownInterval]);

  const circumference = 2 * Math.PI * 18;
  const dashOffset = phase === 'countdown'
    ? circumference * (1 - countdown / COUNTDOWN_SECONDS)
    : 0;

  if (phase === 'countdown') {
    return (
      <div className="relative flex items-center justify-center">
        {/* Cancel tap zone */}
        <div
          className="relative w-14 h-14 flex items-center justify-center cursor-pointer"
          onClick={handleCancel}
          title="Hủy SOS"
        >
          {/* Progress ring */}
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(239,68,68,0.2)" strokeWidth="3" />
            <circle
              cx="22" cy="22" r="18" fill="none"
              stroke="#ef4444" strokeWidth="3"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          {/* Center */}
          <div className="relative z-10 w-10 h-10 rounded-full bg-destructive flex flex-col items-center justify-center shadow-lg">
            <span className="text-white font-bold text-lg leading-none">{countdown}</span>
          </div>
        </div>
        <button
          onClick={handleCancel}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center shadow-md"
          title="Hủy"
        >
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>
    );
  }

  if (phase === 'sending') {
    return (
      <button
        disabled
        className="w-12 h-12 rounded-full bg-destructive flex items-center justify-center shadow-lg opacity-80"
      >
        <Loader2 className="w-5 h-5 text-white animate-spin" />
      </button>
    );
  }

  return (
    <button
      onClick={handlePress}
      className="w-12 h-12 rounded-full bg-destructive hover:bg-destructive/90 flex items-center justify-center shadow-lg animate-pulse active:scale-95 transition-transform"
      title="SOS"
    >
      <AlertTriangle className="w-6 h-6 text-white" />
    </button>
  );
}
