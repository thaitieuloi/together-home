import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FamilyMemberWithProfile } from '@/hooks/useFamily';
import { Tables } from '@/integrations/supabase/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, X, Loader2 } from 'lucide-react';

interface Props {
  members: FamilyMemberWithProfile[];
  onHistoryLoaded: (trail: Tables<'user_locations'>[]) => void;
  onClose: () => void;
}

const TIME_RANGES = {
  vi: [
    { label: '1 giờ', value: '1h', hours: 1 },
    { label: '3 giờ', value: '3h', hours: 3 },
    { label: '6 giờ', value: '6h', hours: 6 },
    { label: '12 giờ', value: '12h', hours: 12 },
    { label: '24 giờ', value: '24h', hours: 24 },
    { label: '3 ngày', value: '3d', hours: 72 },
    { label: '7 ngày', value: '7d', hours: 168 },
  ],
  en: [
    { label: '1 hour', value: '1h', hours: 1 },
    { label: '3 hours', value: '3h', hours: 3 },
    { label: '6 hours', value: '6h', hours: 6 },
    { label: '12 hours', value: '12h', hours: 12 },
    { label: '24 hours', value: '24h', hours: 24 },
    { label: '3 days', value: '3d', hours: 72 },
    { label: '7 days', value: '7d', hours: 168 },
  ],
};

const HISTORY_TEXT = {
  vi: {
    pickMember: 'Chọn thành viên',
    view: 'Xem',
  },
  en: {
    pickMember: 'Select member',
    view: 'View',
  },
};

export default function LocationHistory({ members, onHistoryLoaded, onClose }: Props) {
  const { language } = useLanguage();
  const text = HISTORY_TEXT[language];
  const ranges = TIME_RANGES[language];

  const [selectedMember, setSelectedMember] = useState('');
  const [selectedRange, setSelectedRange] = useState('3h');
  const [loading, setLoading] = useState(false);

  const loadHistory = async () => {
    if (!selectedMember) return;
    setLoading(true);

    const range = ranges.find((r) => r.value === selectedRange);
    const since = new Date(Date.now() - (range?.hours ?? 3) * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from('user_locations')
      .select('*')
      .eq('user_id', selectedMember)
      .gte('timestamp', since)
      .order('timestamp', { ascending: false })
      .limit(500);

    onHistoryLoaded(data ?? []);
    setLoading(false);
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-card border border-border rounded-xl shadow-xl p-3 flex flex-wrap items-center gap-2 max-w-[95vw]">
      <History className="w-4 h-4 text-primary shrink-0" />

      <Select value={selectedMember} onValueChange={setSelectedMember}>
        <SelectTrigger className="w-36 h-8 text-xs">
          <SelectValue placeholder={text.pickMember} />
        </SelectTrigger>
        <SelectContent>
          {members.map((m) => (
            <SelectItem key={m.user_id} value={m.user_id}>
              {m.profile.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedRange} onValueChange={setSelectedRange}>
        <SelectTrigger className="w-24 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ranges.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button size="sm" className="h-8 text-xs" onClick={loadHistory} disabled={!selectedMember || loading}>
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : text.view}
      </Button>

      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onClose}>
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}
