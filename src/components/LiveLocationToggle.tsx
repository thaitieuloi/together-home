import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Radio, Square, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LiveLocationToggleProps {
  isSharing: boolean;
  expiresAt?: string | null;
  onStart: (durationMinutes: number) => Promise<void>;
  onStop: () => Promise<void>;
}

const LIVE_TEXT = {
  vi: {
    minutes15: '15 phút',
    hour1: '1 giờ',
    hour4: '4 giờ',
    hour8: '8 giờ',
    stop: 'Dừng',
    live: 'Chia sẻ Live',
    remaining: 'Còn',
    minuteUnit: 'phút',
  },
  en: {
    minutes15: '15 min',
    hour1: '1 hour',
    hour4: '4 hours',
    hour8: '8 hours',
    stop: 'Stop',
    live: 'Live share',
    remaining: 'Remaining',
    minuteUnit: 'min',
  },
};

export default function LiveLocationToggle({
  isSharing,
  expiresAt,
  onStart,
  onStop,
}: LiveLocationToggleProps) {
  const { language } = useLanguage();
  const text = LIVE_TEXT[language];
  const [duration, setDuration] = useState('60');
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (isSharing) {
        await onStop();
      } else {
        await onStart(parseInt(duration, 10));
      }
    } finally {
      setLoading(false);
    }
  };

  const remainingTime = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000))
    : 0;

  return (
    <div className="flex items-center gap-2">
      {!isSharing && (
        <Select value={duration} onValueChange={setDuration}>
          <SelectTrigger className="w-24 h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15">{text.minutes15}</SelectItem>
            <SelectItem value="60">{text.hour1}</SelectItem>
            <SelectItem value="240">{text.hour4}</SelectItem>
            <SelectItem value="480">{text.hour8}</SelectItem>
          </SelectContent>
        </Select>
      )}
      <Button
        size="sm"
        variant={isSharing ? 'destructive' : 'default'}
        onClick={handleToggle}
        disabled={loading}
        className={cn('gap-1.5', isSharing && 'animate-pulse')}
      >
        {isSharing ? (
          <>
            <Square className="w-3.5 h-3.5" />
            {text.stop} ({remainingTime}p)
          </>
        ) : (
          <>
            <Radio className="w-3.5 h-3.5" />
            {text.live}
          </>
        )}
      </Button>
      {isSharing && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          {text.remaining} {remainingTime} {text.minuteUnit}
        </span>
      )}
    </div>
  );
}
