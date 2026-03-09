import { useState, useEffect, useRef, useCallback } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: (handleClose: () => void) => React.ReactNode;
  duration?: number;
}

/**
 * Wraps a panel to add enter/exit animations.
 * - When `open` becomes true, mounts children with animate-enter.
 * - Call `handleClose` (passed to children) to trigger exit animation, then calls `onClose`.
 */
export default function AnimatedPanel({ open, onClose, children, duration = 200 }: Props) {
  const [mounted, setMounted] = useState(false);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) {
      setMounted(true);
      setAnimating(false);
    }
  }, [open]);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const handleClose = useCallback(() => {
    if (animating) return;
    setAnimating(true);
    timerRef.current = setTimeout(() => {
      setMounted(false);
      setAnimating(false);
      onClose();
    }, duration);
  }, [animating, duration, onClose]);

  if (!mounted) return null;

  return (
    <div className={animating ? 'animate-exit' : 'animate-enter'}>
      {children(handleClose)}
    </div>
  );
}
