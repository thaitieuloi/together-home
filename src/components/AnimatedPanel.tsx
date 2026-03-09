import { useState, useEffect, useRef } from 'react';

interface Props {
  show: boolean;
  onExitComplete: () => void;
  children: React.ReactNode;
  duration?: number;
}

export default function AnimatedPanel({ show, onExitComplete, children, duration = 200 }: Props) {
  const [mounted, setMounted] = useState(true);
  const [animClass, setAnimClass] = useState('animate-enter');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!show) {
      setAnimClass('animate-exit');
      timerRef.current = setTimeout(() => {
        setMounted(false);
        onExitComplete();
      }, duration);
    }
    return () => clearTimeout(timerRef.current);
  }, [show, duration, onExitComplete]);

  if (!mounted) return null;

  return <div className={animClass}>{children}</div>;
}
