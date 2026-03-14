import { useState } from 'react';
import { useFamily } from '@/hooks/useFamily';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Home, UserPlus, LogOut, Share2, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SETUP_TEXT = {
  vi: {
    title: 'Thiết lập gia đình',
    subtitle: 'Tạo gia đình mới hoặc tham gia bằng mã mời',
    createTab: 'Tạo mới',
    joinTab: 'Tham gia',
    familyNamePlaceholder: 'Tên gia đình',
    creating: 'Đang tạo...',
    create: 'Tạo gia đình',
    joining: 'Đang tham gia...',
    join: 'Tham gia',
    invitePlaceholder: 'Nhập mã mời',
    signOut: 'Đăng xuất',
    createSuccess: 'Tạo gia đình thành công!',
    joinSuccess: 'Tham gia gia đình thành công!',
    error: 'Lỗi',
    inviteCode: 'Mã mời',
    shareInvite: 'Chia sẻ liên kết mời',
    copyCode: 'Sao chép mã',
    copied: 'Đã sao chép!',
    shareText: (name: string, code: string) =>
      `🏡 Tham gia gia đình "${name}" trên Together Home!\nMã mời: ${code}\nhttps://togetherhome.app/join?code=${code}`,
    shareTitle: (name: string) => `Tham gia gia đình ${name}`,
  },
  en: {
    title: 'Family Setup',
    subtitle: 'Create a new family or join with an invite code',
    createTab: 'Create',
    joinTab: 'Join',
    familyNamePlaceholder: 'Family name',
    creating: 'Creating...',
    create: 'Create family',
    joining: 'Joining...',
    join: 'Join family',
    invitePlaceholder: 'Enter invite code',
    signOut: 'Sign out',
    createSuccess: 'Family created!',
    joinSuccess: 'Joined family successfully!',
    error: 'Error',
    inviteCode: 'Invite code',
    shareInvite: 'Share invite link',
    copyCode: 'Copy code',
    copied: 'Copied!',
    shareText: (name: string, code: string) =>
      `🏡 Join the "${name}" family on Together Home!\nInvite code: ${code}\nhttps://togetherhome.app/join?code=${code}`,
    shareTitle: (name: string) => `Join the ${name} family`,
  },
};

export default function FamilySetup() {
  const { createFamily, joinFamily } = useFamily();
  const { signOut } = useAuth();
  const { language } = useLanguage();
  const t = SETUP_TEXT[language];
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [createdFamily, setCreatedFamily] = useState<{ name: string; invite_code: string } | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const family = await createFamily(familyName);
      setCreatedFamily({ name: familyName, invite_code: family?.invite_code ?? '' });
      toast({ title: t.createSuccess, description: `${t.inviteCode}: ${family?.invite_code}` });
    } catch (err: any) {
      toast({ title: t.error, description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await joinFamily(inviteCode);
      toast({ title: t.joinSuccess });
    } catch (err: any) {
      toast({ title: t.error, description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleShareInvite = async () => {
    if (!createdFamily) return;
    const text = t.shareText(createdFamily.name, createdFamily.invite_code);
    const title = t.shareTitle(createdFamily.name);

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: `https://togetherhome.app/join?code=${createdFamily.invite_code}` });
      } catch {
        // user cancelled share — that's fine
      }
    } else {
      await navigator.clipboard.writeText(text);
      toast({ title: t.copied });
    }
  };

  const handleCopyCode = async () => {
    if (!createdFamily) return;
    await navigator.clipboard.writeText(createdFamily.invite_code);
    toast({ title: t.copied });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/10 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-2">
            <Home className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t.title}</h1>
          <p className="text-muted-foreground">{t.subtitle}</p>
        </div>

        <Card className="border-border/50 shadow-xl">
          <Tabs defaultValue="create">
            <CardHeader className="pb-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="create">{t.createTab}</TabsTrigger>
                <TabsTrigger value="join">{t.joinTab}</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="create">
                <form onSubmit={handleCreate} className="space-y-4">
                  <Input
                    placeholder={t.familyNamePlaceholder}
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                    required
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    <Home className="w-4 h-4 mr-2" />
                    {loading ? t.creating : t.create}
                  </Button>
                </form>

                {createdFamily && (
                  <div className="mt-4 p-3 rounded-xl bg-muted/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">{t.inviteCode}</p>
                        <p className="font-mono font-bold text-lg tracking-widest text-foreground">
                          {createdFamily.invite_code}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={handleCopyCode}>
                        <Copy className="w-3.5 h-3.5 mr-1" />
                        {t.copyCode}
                      </Button>
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={handleShareInvite}>
                      <Share2 className="w-4 h-4 mr-2" />
                      {t.shareInvite}
                    </Button>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="join">
                <form onSubmit={handleJoin} className="space-y-4">
                  <Input
                    placeholder={t.invitePlaceholder}
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    required
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    {loading ? t.joining : t.join}
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <div className="text-center">
          <Button variant="ghost" onClick={signOut} className="text-muted-foreground">
            <LogOut className="w-4 h-4 mr-2" /> {t.signOut}
          </Button>
        </div>
      </div>
    </div>
  );
}
