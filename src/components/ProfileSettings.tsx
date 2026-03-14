import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage, type AppLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Save, Loader2, User, Bell, Languages } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  onBack: () => void;
  onOpenGeofenceSettings?: () => void;
}

export default function ProfileSettings({ onBack, onOpenGeofenceSettings }: Props) {
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setDisplayName(data.display_name);
          setAvatarUrl(data.avatar_url || '');
        }
        setLoading(false);
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName,
        avatar_url: avatarUrl || null,
      })
      .eq('user_id', user.id);

    if (error) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Đã lưu thông tin!' });
    }

    setSaving(false);
  };

  const handleLanguageChange = (value: string) => {
    if (value !== 'vi' && value !== 'en') return;

    setLanguage(value as AppLanguage);
    toast({ title: value === 'vi' ? 'Đã chuyển sang Tiếng Việt' : 'Switched to English' });
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Cài đặt cá nhân</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4" />
              Thông tin cá nhân
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <Avatar className="w-20 h-20">
                {avatarUrl ? <AvatarImage src={avatarUrl} /> : null}
                <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                  {displayName ? getInitials(displayName) : '?'}
                </AvatarFallback>
              </Avatar>
            </div>

            <div>
              <Label>Tên hiển thị</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nhập tên hiển thị"
              />
            </div>

            <div>
              <Label>URL ảnh đại diện</Label>
              <Input
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
              />
            </div>

            <div>
              <Label className="text-muted-foreground">Email</Label>
              <Input value={user?.email || ''} disabled className="bg-muted" />
            </div>

            <Button onClick={handleSave} disabled={saving || !displayName} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Lưu thay đổi
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Languages className="w-4 h-4" />
              Ngôn ngữ hiển thị
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Label>Ngôn ngữ bản đồ & giao diện</Label>
            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Chọn ngôn ngữ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vi">Tiếng Việt (mặc định)</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {onOpenGeofenceSettings && (
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={onOpenGeofenceSettings}>
            <CardContent className="flex items-center gap-3 p-4">
              <Bell className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Thông báo vùng an toàn</p>
                <p className="text-xs text-muted-foreground">Bật/tắt thông báo và xem lịch sử</p>
              </div>
              <ArrowLeft className="w-4 h-4 text-muted-foreground rotate-180" />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
