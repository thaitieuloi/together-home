import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function SOSButton() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  const sendSOS = async () => {
    if (!user) return;
    setSending(true);

    try {
      // Get current location
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const { latitude, longitude } = position.coords;

      // Insert SOS alert
      const { error } = await supabase.from('sos_alerts').insert({
        user_id: user.id,
        latitude,
        longitude,
      });

      if (error) throw error;

      // Call edge function to notify family members
      await supabase.functions.invoke('send-sos-notification', {
        body: { latitude, longitude },
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
      setSending(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="icon"
          className="shadow-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground w-12 h-12 rounded-full animate-pulse"
        >
          <AlertTriangle className="w-6 h-6" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Gửi tín hiệu SOS?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Tín hiệu khẩn cấp sẽ được gửi đến tất cả thành viên trong gia đình kèm vị trí hiện tại của bạn.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Hủy</AlertDialogCancel>
          <AlertDialogAction
            onClick={sendSOS}
            disabled={sending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Gửi SOS ngay
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
