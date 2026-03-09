import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Radio, Square, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
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

export default function LiveLocationToggle({
  isSharing,
  expiresAt,
  onStart,
  onStop,
}: LiveLocationToggleProps) {
  const [duration, setDuration] = useState('60');
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (isSharing) {
        await onStop();
      } else {
        await onStart(parseInt(duration));
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
            <SelectItem value="15">15 phút</SelectItem>
            <SelectItem value="60">1 giờ</SelectItem>
            <SelectItem value="240">4 giờ</SelectItem>
            <SelectItem value="480">8 giờ</SelectItem>
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
            Dừng ({remainingTime}p)
          </>
        ) : (
          <>
            <Radio className="w-3.5 h-3.5" />
            Chia sẻ Live
          </>
        )}
      </Button>
      {isSharing && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          Còn {remainingTime} phút
        </span>
      )}
    </div>
  );
}
