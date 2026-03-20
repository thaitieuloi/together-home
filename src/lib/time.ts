import { formatDistance, formatDistanceToNow, subMilliseconds } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';

let serverTimeOffset = 0; // ms: serverTime - localTime

/**
 * Update the global server time offset
 */
export async function syncServerTime() {
  const start = Date.now();
  try {
    const { data, error } = await (supabase.rpc as any)('get_server_time');
    if (error) throw error;
    
    const end = Date.now();
    const roundTrip = (end - start) / 2;
    const serverTime = new Date(data).getTime();
    
    // Offset = actualServerTime - clientNow
    // We adjust for round-trip latency by assuming it took half the time to get the response back
    serverTimeOffset = (serverTime + roundTrip) - end;
    
    console.log('[TimeSync] Offset:', serverTimeOffset, 'ms');
  } catch (err) {
    console.warn('[TimeSync] Failed to sync server time:', err);
  }
}

/**
 * Get current server time as a Date object
 */
export function getServerNow() {
  return new Date(Date.now() + serverTimeOffset);
}

/**
 * Formats a distance with clock skew correction
 */
export function formatRelativeTime(date: string | Date | number, language: 'vi' | 'en' = 'vi') {
  const locale = language === 'vi' ? vi : enUS;
  const targetDate = new Date(date);
  const correctedNow = getServerNow();
  
  // If the target date is accidentally in the future due to small drift, just show "just now"
  const diff = correctedNow.getTime() - targetDate.getTime();
  if (diff < 30000) { // < 30 seconds
    return language === 'vi' ? 'vừa xong' : 'just now';
  }
  
  return formatDistance(targetDate, correctedNow, { 
    addSuffix: true, 
    locale 
  });
}
