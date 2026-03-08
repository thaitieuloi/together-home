import { useAuth } from '@/hooks/useAuth';
import Auth from './Auth';
import Dashboard from './Dashboard';

const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  if (!user) return <Auth />;
  return <Dashboard />;
};

export default Index;
