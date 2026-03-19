import { useState, useEffect, useRef } from 'react';
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
import { ArrowLeft, Save, Loader2, User, Bell, Languages, Camera, X, LogOut, ShieldAlert } from 'lucide-react';
import { useFamily } from '@/hooks/useFamily';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface Props {
  onBack: () => void;
  onOpenGeofenceSettings?: () => void;
}

const TEXT = {
  vi: {
    title: 'Cài đặt cá nhân',
    personal: 'Thông tin cá nhân',
    displayName: 'Tên hiển thị',
    displayNamePlaceholder: 'Nhập tên hiển thị',
    email: 'Email',
    save: 'Lưu thay đổi',
    saved: 'Đã lưu thông tin!',
    error: 'Lỗi',
    language: 'Ngôn ngữ hiển thị',
    languageLabel: 'Ngôn ngữ bản đồ & giao diện',
    langVi: 'Tiếng Việt (mặc định)',
    langEn: 'English',
    switchedVi: 'Đã chuyển sang Tiếng Việt',
    switchedEn: 'Switched to English',
    notifications: 'Thông báo vùng an toàn',
    notificationsDesc: 'Bật/tắt thông báo và xem lịch sử',
    uploadAvatar: 'Tải ảnh đại diện',
    uploading: 'Đang tải lên...',
    uploadError: 'Lỗi tải ảnh',
    uploadErrorDesc: 'Chỉ chấp nhận JPEG, PNG, WebP (tối đa 5MB)',
    uploadSuccess: 'Đã cập nhật ảnh đại diện!',
    removeAvatar: 'Xóa ảnh',
    leaveFamily: 'Rời khỏi gia đình',
    leaveFamilyDesc: 'Bạn sẽ không còn thấy vị trí của các thành viên khác.',
    leaveConfirm: 'Xác nhận rời gia đình?',
    leaveConfirmDesc: 'Hành động này không thể hoàn tác. Bạn sẽ cần mã mời mới để tham gia lại.',
  },
  en: {
    title: 'Profile Settings',
    personal: 'Personal Info',
    displayName: 'Display Name',
    displayNamePlaceholder: 'Enter display name',
    email: 'Email',
    save: 'Save Changes',
    saved: 'Changes saved!',
    error: 'Error',
    language: 'Display Language',
    languageLabel: 'Map & interface language',
    langVi: 'Tiếng Việt (default)',
    langEn: 'English',
    switchedVi: 'Đã chuyển sang Tiếng Việt',
    switchedEn: 'Switched to English',
    notifications: 'Zone Notifications',
    notificationsDesc: 'Toggle alerts and view history',
    uploadAvatar: 'Upload Photo',
    uploading: 'Uploading...',
    uploadError: 'Upload Error',
    uploadErrorDesc: 'Only JPEG, PNG, WebP accepted (max 5MB)',
    uploadSuccess: 'Avatar updated!',
    removeAvatar: 'Remove Photo',
    leaveFamily: 'Leave Family',
    leaveFamilyDesc: 'You will no longer see other members\' locations.',
    leaveConfirm: 'Leave Family?',
    leaveConfirmDesc: 'This action cannot be undone. You will need a new invite code to rejoin.',
  },
};

export default function ProfileSettings({ onBack, onOpenGeofenceSettings }: Props) {
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();
  const t = TEXT[language];
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { family, refetch } = useFamily();
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

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
          setAvatarUrl(data.avatar_url || null);
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
        avatar_url: avatarUrl,
      })
      .eq('user_id', user.id);

    if (error) {
      toast({ title: t.error, description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t.saved });
    }

    setSaving(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: t.uploadError, description: t.uploadErrorDesc, variant: 'destructive' });
      return;
    }

    if (file.size > MAX_SIZE) {
      toast({ title: t.uploadError, description: t.uploadErrorDesc, variant: 'destructive' });
      return;
    }

    setUploading(true);

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const filePath = `avatars/${user.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      toast({ title: t.uploadError, description: uploadError.message, variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
    const publicUrl = data.publicUrl + `?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('user_id', user.id);

    if (updateError) {
      toast({ title: t.uploadError, description: updateError.message, variant: 'destructive' });
    } else {
      setAvatarUrl(publicUrl);
      toast({ title: t.uploadSuccess });
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from('profiles').update({ avatar_url: null }).eq('user_id', user.id);
    setAvatarUrl(null);
    setSaving(false);
  };

  const handleLeaveFamily = async () => {
    if (!user || !family) return;
    setLeaving(true);
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('user_id', user.id)
      .eq('family_id', family.id);

    if (error) {
      toast({ title: t.error, description: error.message, variant: 'destructive' });
      setLeaving(false);
    } else {
      // Sync legacy table if needed
      await supabase.from('users' as any).update({ family_id: '' }).eq('id', user.id);
      window.location.reload(); // Refresh to go back to FamilySetup
    }
  };

  const handleLanguageChange = (value: string) => {
    if (value !== 'vi' && value !== 'en') return;
    setLanguage(value as AppLanguage);
    toast({ title: value === 'vi' ? TEXT.vi.switchedVi : TEXT.en.switchedEn });
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
          <h1 className="text-lg font-semibold text-foreground">{t.title}</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4" />
              {t.personal}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Avatar section */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative group">
                <Avatar className="w-24 h-24">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                    {displayName ? getInitials(displayName) : '?'}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  aria-label={t.uploadAvatar}
                >
                  {uploading ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Camera className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {uploading ? t.uploading : t.uploadAvatar}
                </Button>
                {avatarUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveAvatar}
                    disabled={saving}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    {t.removeAvatar}
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label>{t.displayName}</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t.displayNamePlaceholder}
              />
            </div>

            <div>
              <Label className="text-muted-foreground">{t.email}</Label>
              <Input value={user?.email || ''} disabled className="bg-muted" />
            </div>

            <Button onClick={handleSave} disabled={saving || !displayName} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {t.save}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Languages className="w-4 h-4" />
              {t.language}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Label>{t.languageLabel}</Label>
            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Chọn ngôn ngữ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vi">{t.langVi}</SelectItem>
                <SelectItem value="en">{t.langEn}</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {onOpenGeofenceSettings && (
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={onOpenGeofenceSettings}>
            <CardContent className="flex items-center gap-3 p-4">
              <Bell className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{t.notifications}</p>
                <p className="text-xs text-muted-foreground">{t.notificationsDesc}</p>
              </div>
              <ArrowLeft className="w-4 h-4 text-muted-foreground rotate-180" />
            </CardContent>
          </Card>
        )}

        {family && (
          <div className="pt-6">
            <h2 className="text-sm font-semibold text-destructive px-1 mb-3 flex items-center gap-2 uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4" />
              {language === 'vi' ? 'Vùng nguy hiểm' : 'Danger Zone'}
            </h2>
            <Card className="border-destructive/20 bg-destructive/5 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => setShowLeaveConfirm(true)}>
              <CardContent className="flex items-center gap-3 p-4">
                <LogOut className="w-5 h-5 text-destructive" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">{t.leaveFamily}</p>
                  <p className="text-xs text-muted-foreground">{t.leaveFamilyDesc}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">{t.leaveConfirm}</AlertDialogTitle>
            <AlertDialogDescription>{t.leaveConfirmDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">{language === 'vi' ? 'Hủy' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 rounded-xl"
              onClick={handleLeaveFamily}
              disabled={leaving}
            >
              {leaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t.leaveFamily}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
