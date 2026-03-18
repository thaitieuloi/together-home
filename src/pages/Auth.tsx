import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Users, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupInviteCode, setSignupInviteCode] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(loginEmail, loginPassword);
    } catch (err: any) {
      toast({ title: 'Lỗi đăng nhập', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signUp(signupEmail, signupPassword, signupName, signupInviteCode);
      toast({ title: 'Đăng ký thành công', description: 'Kiểm tra email để xác nhận tài khoản.' });
    } catch (err: any) {
      toast({ title: 'Lỗi đăng ký', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
      <div className="w-full max-w-md space-y-8 relative animate-fade-in">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <MapPin className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Family Tracker</h1>
          <p className="text-muted-foreground flex items-center justify-center gap-1.5">
            <Users className="w-4 h-4" /> Theo dõi vị trí gia đình an toàn
          </p>
        </div>

        <Card className="glass glass-dark shadow-2xl border-border/50">
          <Tabs defaultValue="login">
            <CardHeader className="pb-2">
              <TabsList className="grid w-full grid-cols-2 rounded-xl">
                <TabsTrigger value="login" className="rounded-lg">Đăng nhập</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg">Đăng ký</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <Input
                    type="email"
                    placeholder="Email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    className="h-11 rounded-xl"
                  />
                  <Input
                    type="password"
                    placeholder="Mật khẩu"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    className="h-11 rounded-xl"
                  />
                  <Button type="submit" className="w-full h-11 rounded-xl font-medium" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {loading ? 'Đang xử lý...' : 'Đăng nhập'}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <Input
                    placeholder="Tên hiển thị"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    required
                    className="h-11 rounded-xl"
                  />
                  <Input
                    type="email"
                    placeholder="Email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                    className="h-11 rounded-xl"
                  />
                  <Input
                    type="password"
                    placeholder="Mật khẩu (tối thiểu 6 ký tự)"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-11 rounded-xl"
                  />
                  <Input
                    placeholder="Mã mời gia đình (tùy chọn)"
                    value={signupInviteCode}
                    onChange={(e) => setSignupInviteCode(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                  <Button type="submit" className="w-full h-11 rounded-xl font-medium" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {loading ? 'Đang xử lý...' : 'Đăng ký'}
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
