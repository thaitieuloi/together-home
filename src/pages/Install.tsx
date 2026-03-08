import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Download, MapPin, Share, MoreVertical, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPage() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/10 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary text-primary-foreground mb-2">
            <MapPin className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Family Tracker</h1>
          <p className="text-muted-foreground">Cài đặt ứng dụng để theo dõi vị trí gia đình</p>
        </div>

        <Card className="border-border/50 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg">Cài đặt ứng dụng</CardTitle>
            <CardDescription>
              Cài Family Tracker lên điện thoại để sử dụng như ứng dụng thật
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isInstalled ? (
              <div className="text-center space-y-3">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 text-green-600">
                  <Check className="w-6 h-6" />
                </div>
                <p className="text-sm text-muted-foreground">Ứng dụng đã được cài đặt!</p>
                <Button className="w-full" onClick={() => navigate('/')}>
                  Mở ứng dụng
                </Button>
              </div>
            ) : deferredPrompt ? (
              <Button className="w-full" size="lg" onClick={handleInstall}>
                <Download className="w-5 h-5 mr-2" /> Cài đặt ngay
              </Button>
            ) : isIOS ? (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Hướng dẫn cài đặt trên iPhone:</p>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
                  <p>Nhấn nút <Share className="w-4 h-4 inline" /> <strong>Chia sẻ</strong> ở thanh trình duyệt</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
                  <p>Cuộn xuống và chọn <strong>"Thêm vào Màn hình chính"</strong></p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
                  <p>Nhấn <strong>"Thêm"</strong> ở góc phải</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Hướng dẫn cài đặt trên Android:</p>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
                  <p>Nhấn nút <MoreVertical className="w-4 h-4 inline" /> <strong>Menu</strong> ở góc phải trên</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
                  <p>Chọn <strong>"Cài đặt ứng dụng"</strong> hoặc <strong>"Thêm vào Màn hình chính"</strong></p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
                  <p>Nhấn <strong>"Cài đặt"</strong></p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center">
          <Button variant="ghost" onClick={() => navigate('/')} className="text-muted-foreground">
            Bỏ qua, tiếp tục trên trình duyệt
          </Button>
        </div>
      </div>
    </div>
  );
}
