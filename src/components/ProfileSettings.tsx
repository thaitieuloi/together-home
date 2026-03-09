import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save, Loader2, User, Bell } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

interface Props {
  onBack: () => void;
  onOpenGeofenceSettings?: () => void;
}

export default function ProfileSettings({ onBack, onOpenGeofenceSettings }: Props) {
  const { user } = useAuth();
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

  const getInitials = (name: string) =>
    name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

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
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} />
                ) : null}
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
      </div>
    </div>
  );
}
