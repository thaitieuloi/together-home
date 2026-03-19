import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFamily } from '@/hooks/useFamily';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Trash2, Plus, X, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Geofence {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  created_at: string;
}

interface Props {
  onClose: () => void;
  pendingLocation?: { lat: number; lng: number } | null;
  onClearPending?: () => void;
}

export default function GeofenceManager({ onClose, pendingLocation, onClearPending }: Props) {
  const { user } = useAuth();
  const { family, members } = useFamily();
  const isAdmin = members.find(m => m.user_id === user?.id)?.role === 'admin';
  const { toast } = useToast();
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('500');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (pendingLocation) {
      setLat(pendingLocation.lat.toFixed(6));
      setLng(pendingLocation.lng.toFixed(6));
      setShowAdd(true);
      onClearPending?.();
    }
  }, [pendingLocation, onClearPending]);

  const fetchGeofences = async () => {
    if (!family) return;
    const { data } = await supabase
      .from('geofences')
      .select('*')
      .eq('family_id', family.id)
      .order('created_at', { ascending: false });
    setGeofences(data ?? []);
  };

  useEffect(() => {
    fetchGeofences();
  }, [family]);

  const addGeofence = async () => {
    if (!family || !name || !lat || !lng) return;
    setLoading(true);
    const { error } = await supabase.from('geofences').insert({
      family_id: family.id,
      name,
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
      radius_meters: parseFloat(radius) || 500,
      created_by: (await supabase.auth.getUser()).data.user!.id,
    });
    if (error) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Đã thêm vùng an toàn!' });
      setShowAdd(false);
      setName('');
      setLat('');
      setLng('');
      setRadius('500');
      fetchGeofences();
    }
    setLoading(false);
  };

  const deleteGeofence = async (id: string) => {
    const { error } = await supabase.from('geofences').delete().eq('id', id);
    if (error) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Đã xóa vùng an toàn' });
      fetchGeofences();
    }
  };

  return (
    <div className="absolute top-16 right-4 z-[1000] bg-card border border-border rounded-xl shadow-xl w-80 max-h-[70vh] flex flex-col">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">Vùng an toàn</span>
        </div>
        <div className="flex gap-1">
          {isAdmin && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-2 text-xs text-muted-foreground bg-muted/50">
        💡 Click vào bản đồ để chọn vị trí nhanh
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-2">
        {geofences.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Chưa có vùng an toàn nào
          </p>
        )}
        {geofences.map((g) => (
          <div key={g.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{g.name}</p>
              <p className="text-xs text-muted-foreground">
                Bán kính: {g.radius_meters}m
              </p>
            </div>
            {isAdmin && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteGeofence(g.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm vùng an toàn</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tên vùng</Label>
              <Input placeholder="VD: Nhà, Trường học..." value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Vĩ độ</Label>
                <Input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="10.8231" />
              </div>
              <div>
                <Label>Kinh độ</Label>
                <Input type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="106.6297" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Bán kính</Label>
                <span className="text-sm font-semibold text-primary">{radius} m</span>
              </div>
              <input
                type="range"
                min="50"
                max="5000"
                step="50"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-primary bg-muted"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>50 m</span>
                <span>2.5 km</span>
                <span>5 km</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Hủy</Button>
            <Button onClick={addGeofence} disabled={loading || !name || !lat || !lng}>
              Thêm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
