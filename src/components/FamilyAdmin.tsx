import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFamily, FamilyMemberWithProfile } from '@/hooks/useFamily';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  ArrowLeft, 
  Save, 
  Loader2, 
  Users, 
  RefreshCw, 
  UserPlus, 
  ShieldCheck, 
  UserMinus,
  Info,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';
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
} from '@/components/ui/alert-dialog';

interface Props {
  onBack: () => void;
}

const TEXT = {
  vi: {
    title: 'Quản lý gia đình',
    familyInfo: 'Thông tin gia đình',
    familyName: 'Tên gia đình',
    inviteCode: 'Mã mời',
    regenerateCode: 'Tạo mã mới',
    members: 'Quản lý thành viên',
    memberCount: 'thành viên',
    save: 'Lưu thay đổi',
    saved: 'Đã cập nhật thông tin gia đình!',
    error: 'Lỗi',
    promote: 'Cấp quyền Admin',
    remove: 'Xóa khỏi gia đình',
    admin: 'Quản trị viên',
    member: 'Thành viên',
    cannotRemoveSelf: 'Bạn không thể tự xóa chính mình',
    confirmRemove: 'Bạn có chắc chắn muốn xóa thành viên này?',
    confirmPromote: 'Bạn có muốn cấp quyền Admin cho người này?',
    successPromoted: 'Đã cấp quyền Admin!',
    regenerationSuccess: 'Mã mời đã được thay đổi!',
    desc: 'Chỉnh sửa thông tin và quản lý các thành viên trong nhóm.',
    dangerZone: 'Khu vực nguy hiểm',
    transferOwnership: 'Chuyển quyền sở hữu',
    regenerateWarning: 'Mã cũ sẽ không còn hiệu lực sau khi đổi.',
  },
  en: {
    title: 'Family Management',
    familyInfo: 'Family Information',
    familyName: 'Family Name',
    inviteCode: 'Invite Code',
    regenerateCode: 'Regenerate Code',
    members: 'Member Management',
    memberCount: 'members',
    save: 'Save Changes',
    saved: 'Family info updated!',
    error: 'Error',
    promote: 'Promote to Admin',
    remove: 'Remove from Family',
    admin: 'Administrator',
    member: 'Member',
    cannotRemoveSelf: 'You cannot remove yourself',
    confirmRemove: 'Are you sure you want to remove this member?',
    confirmPromote: 'Do you want to promote this member to Admin?',
    successPromoted: 'Member promoted to Admin!',
    regenerationSuccess: 'Invite code regenerated!',
    desc: 'Edit family details and manage group members.',
    dangerZone: 'Danger Zone',
    transferOwnership: 'Transfer Ownership',
    regenerateWarning: 'Old code will stop working after regeneration.',
  },
};

export default function FamilyAdmin({ onBack }: Props) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = TEXT[language];
  const { family, members, refetch } = useFamily();
  const { toast } = useToast();

  const [familyName, setFamilyName] = useState(family?.name || '');
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [actionMember, setActionMember] = useState<FamilyMemberWithProfile | null>(null);
  const [confirmType, setConfirmType] = useState<'remove' | 'promote' | null>(null);

  useEffect(() => {
    if (family) setFamilyName(family.name);
  }, [family]);

  const isAdmin = members.find((m) => m.user_id === user?.id)?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <ShieldCheck className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">{t.error}</h2>
        <p className="text-muted-foreground mb-4">Bạn không có quyền truy cập trang này.</p>
        <Button onClick={onBack}>{t.title}</Button>
      </div>
    );
  }

  const handleSaveFamily = async () => {
    if (!family) return;
    setSaving(true);
    const { error } = await supabase
      .from('families')
      .update({ name: familyName })
      .eq('id', family.id);

    if (error) {
      toast({ title: t.error, description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t.saved });
      refetch();
    }
    setSaving(false);
  };

  const handleRegenerateCode = async () => {
    if (!family) return;
    setRegenerating(true);
    const newCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    const { error } = await supabase
      .from('families')
      .update({ invite_code: newCode })
      .eq('id', family.id);

    if (error) {
      toast({ title: t.error, description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t.regenerationSuccess });
      refetch();
    }
    setRegenerating(false);
  };

  const handleMemberAction = async () => {
    if (!actionMember || !family || !confirmType) return;

    if (confirmType === 'remove') {
      const { error } = await supabase
        .from('family_members')
        .delete()
        .eq('user_id', actionMember.user_id)
        .eq('family_id', family.id);

      if (error) {
        toast({ title: t.error, description: error.message, variant: 'destructive' });
      } else {
        toast({ title: `Đã xóa ${actionMember.profile.display_name}` });
        refetch();
      }
    } else if (confirmType === 'promote') {
      const { error } = await supabase
        .from('family_members')
        .update({ role: 'admin' })
        .eq('user_id', actionMember.user_id)
        .eq('family_id', family.id);

      if (error) {
        toast({ title: t.error, description: error.message, variant: 'destructive' });
      } else {
        toast({ title: t.successPromoted });
        refetch();
      }
    }

    setActionMember(null);
    setConfirmType(null);
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="min-h-screen bg-background pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mt-2">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-10 w-10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground truncate">{t.title}</h1>
            <p className="text-sm text-muted-foreground">{t.desc}</p>
          </div>
        </div>

        {/* Family Details Card */}
        <Card className="overflow-hidden border-border/50 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              {t.familyInfo}
            </CardTitle>
            <CardDescription>{family?.id}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="family-name">{t.familyName}</Label>
              <div className="flex gap-2">
                <Input
                  id="family-name"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleSaveFamily} disabled={saving || familyName === family?.name}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  <span className="hidden sm:inline">{t.save}</span>
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t.inviteCode}</Label>
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-border/50">
                <code className="text-xl font-bold tracking-widest text-primary flex-1">
                  {family?.invite_code || '---'}
                </code>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRegenerateCode} 
                  disabled={regenerating}
                  className="h-9"
                >
                  {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  {t.regenerateCode}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                <Info className="w-3 h-3" />
                {t.regenerateWarning}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Members Management Card */}
        <Card className="border-border/50 shadow-sm overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                {t.members}
              </div>
              <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-1 rounded-full">
                {members.length} {t.memberCount}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/40">
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between p-4 hover:bg-accent/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-border/50">
                      <AvatarImage src={m.profile.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {getInitials(m.profile.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate max-w-[150px] sm:max-w-xs">
                        {m.profile.display_name}
                        {m.user_id === user?.id && <span className="ml-1 text-[10px] text-muted-foreground">(Tôi)</span>}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {m.role === 'admin' ? (
                          <Badge className="bg-primary/20 text-primary hover:bg-primary/20 border-none px-1.5 py-0 text-[10px]">
                            {t.admin}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">{t.member}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {m.user_id !== user?.id && (
                    <div className="flex items-center gap-1">
                      {m.role !== 'admin' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => {
                            setActionMember(m);
                            setConfirmType('promote');
                          }}
                          title={t.promote}
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setActionMember(m);
                          setConfirmType('remove');
                        }}
                        title={t.remove}
                      >
                        <UserMinus className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
          <div className="p-4 bg-muted/30 border-t border-border/50">
            <Button variant="outline" className="w-full justify-start text-muted-foreground h-12 rounded-xl border-dashed">
              <UserPlus className="w-4 h-4 mr-2" />
              {t.inviteCode}: {family?.invite_code}
            </Button>
          </div>
        </Card>

        {/* Danger Zone */}
        <div className="pt-4">
          <h2 className="text-sm font-semibold text-destructive px-1 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {t.dangerZone}
          </h2>
          <Card className="border-destructive/20 bg-destructive/5 overflow-hidden">
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t.transferOwnership}</p>
                <p className="text-xs text-muted-foreground">Chuyển quyền quản trị cao nhất sang một thành viên khác.</p>
              </div>
              <Button variant="outline" size="sm" className="border-destructive/20 hover:bg-destructive hover:text-white transition-all">
                Bắt đầu
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!actionMember} onOpenChange={(o) => !o && setActionMember(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmType === 'remove' ? t.confirmRemove : t.confirmPromote}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này sẽ áp dụng cho <strong>{actionMember?.profile.display_name}</strong>.
              {confirmType === 'promote' && ' Sau khi thăng cấp, họ sẽ có toàn quyền quản lý như bạn.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">{language === 'vi' ? 'Hủy' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              className={confirmType === 'remove' ? 'bg-destructive text-white hover:bg-destructive/90 rounded-xl' : 'rounded-xl'}
              onClick={handleMemberAction}
            >
              {language === 'vi' ? 'Xác nhận' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Badge({ children, className, ...props }: any) {
  return (
    <span 
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
