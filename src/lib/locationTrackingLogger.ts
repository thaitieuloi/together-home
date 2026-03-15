type TrackingLogLevel = 'debug' | 'info' | 'warn' | 'error';

const PREFIX = '[LocationTracking]';

function isDebugEnabled() {
  if (typeof window === 'undefined') return true;
  const flag = window.localStorage.getItem('tracking_debug');
  return flag !== '0';
}

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

export function trackingLog(level: TrackingLogLevel, message: string, context?: Record<string, unknown>) {
  if (level === 'debug' && !isDebugEnabled()) return;

  const timestamp = new Date().toISOString();
  const payload = context ? { ts: timestamp, ...context } : { ts: timestamp };

  switch (level) {
    case 'debug':
      console.debug(`${PREFIX} ${message}`, payload);
      break;
    case 'info':
      console.info(`${PREFIX} ${message}`, payload);
      break;
    case 'warn':
      console.warn(`${PREFIX} ${message}`, payload);
      break;
    case 'error':
      console.error(`${PREFIX} ${message}`, payload);
      break;
  }
}
