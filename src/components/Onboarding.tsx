import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Bell, MessageCircle, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

const SLIDES = {
  vi: [
    {
      icon: MapPin,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      title: 'Biết mọi người đang ở đâu',
      desc: 'Xem vị trí thời gian thực của cả gia đình trên bản đồ. Luôn kết nối, dù cách xa.',
    },
    {
      icon: Bell,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
      title: 'Cảnh báo an toàn tức thì',
      desc: 'Nhận thông báo khi ai đó vào/ra vùng an toàn, pin yếu, hoặc gửi SOS khẩn cấp.',
    },
    {
      icon: MessageCircle,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      title: 'Chat gia đình trong tầm tay',
      desc: 'Nhắn tin, chia sẻ hình ảnh, và gửi vị trí trực tiếp trong gia đình.',
    },
  ],
  en: [
    {
      icon: MapPin,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      title: 'Know where everyone is',
      desc: "See your family's real-time location on the map. Stay connected, no matter the distance.",
    },
    {
      icon: Bell,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
      title: 'Instant safety alerts',
      desc: 'Get notified when someone enters or leaves a zone, has low battery, or sends an SOS.',
    },
    {
      icon: MessageCircle,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      title: 'Family chat at your fingertips',
      desc: 'Message, share photos, and send your location directly in the family group.',
    },
  ],
};

const TEXT = {
  vi: { skip: 'Bỏ qua', next: 'Tiếp theo', start: 'Bắt đầu ngay' },
  en: { skip: 'Skip', next: 'Next', start: 'Get started' },
};

interface Props {
  onDone: () => void;
}

export default function Onboarding({ onDone }: Props) {
  const { language } = useLanguage();
  const slides = SLIDES[language];
  const t = TEXT[language];
  const [step, setStep] = useState(0);

  const slide = slides[step];
  const Icon = slide.icon;
  const isLast = step === slides.length - 1;

  const finish = () => {
    localStorage.setItem('onboarding_done', '1');
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm glass glass-dark rounded-3xl shadow-2xl p-8 flex flex-col items-center gap-6 animate-fade-in">
        <button
          onClick={finish}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t.skip}
        >
          <X className="w-5 h-5" />
        </button>

        <div className={cn('w-20 h-20 rounded-2xl flex items-center justify-center', slide.bg)}>
          <Icon className={cn('w-10 h-10', slide.color)} />
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-foreground">{slide.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{slide.desc}</p>
        </div>

        <div className="flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                i === step ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30'
              )}
            />
          ))}
        </div>

        <div className="flex w-full gap-3">
          {step > 0 && (
            <Button variant="outline" className="flex-1" onClick={() => setStep(step - 1)}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t.skip}
            </Button>
          )}
          {step === 0 && (
            <Button variant="ghost" className="flex-1 text-muted-foreground" onClick={finish}>
              {t.skip}
            </Button>
          )}
          <Button className="flex-1" onClick={isLast ? finish : () => setStep(step + 1)}>
            {isLast ? t.start : t.next}
            {!isLast && <ChevronRight className="w-4 h-4 ml-1" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
