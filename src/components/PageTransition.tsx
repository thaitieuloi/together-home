import { useEffect, useState, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  className?: string;
  show?: boolean;
  onExitComplete?: () => void;
}

export default function PageTransition({ children, className, show = true, onExitComplete }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!show && mounted) {
      setVisible(false);
      const timer = setTimeout(() => {
        onExitComplete?.();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [show, mounted, onExitComplete]);

  return (
    <div
      className={cn(
        'transition-all duration-250 ease-out',
        mounted && visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.98]',
        className
      )}
    >
      {children}
    </div>
  );
}
