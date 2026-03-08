import { useState } from 'react';
import { useFamily } from '@/hooks/useFamily';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Home, UserPlus, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function FamilySetup() {
  const { createFamily, joinFamily } = useFamily();
  const { signOut } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const family = await createFamily(familyName);
      toast({ title: 'Tạo gia đình thành công!', description: `Mã mời: ${family?.invite_code}` });
    } catch (err: any) {
      toast({ title: 'Lỗi', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await joinFamily(inviteCode);
      toast({ title: 'Tham gia gia đình thành công!' });
    } catch (err: any) {
      toast({ title: 'Lỗi', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/10 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-2">
            <Home className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Thiết lập gia đình</h1>
          <p className="text-muted-foreground">Tạo gia đình mới hoặc tham gia bằng mã mời</p>
        </div>

        <Card className="border-border/50 shadow-xl">
          <Tabs defaultValue="create">
            <CardHeader className="pb-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="create">Tạo mới</TabsTrigger>
                <TabsTrigger value="join">Tham gia</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="create">
                <form onSubmit={handleCreate} className="space-y-4">
                  <Input
                    placeholder="Tên gia đình"
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                    required
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    <Home className="w-4 h-4 mr-2" />
                    {loading ? 'Đang tạo...' : 'Tạo gia đình'}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="join">
                <form onSubmit={handleJoin} className="space-y-4">
                  <Input
                    placeholder="Nhập mã mời"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    required
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    {loading ? 'Đang tham gia...' : 'Tham gia'}
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <div className="text-center">
          <Button variant="ghost" onClick={signOut} className="text-muted-foreground">
            <LogOut className="w-4 h-4 mr-2" /> Đăng xuất
          </Button>
        </div>
      </div>
    </div>
  );
}
