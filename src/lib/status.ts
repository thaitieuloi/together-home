import { formatRelativeTime } from '@/lib/time';

export type UserStatus = 'online' | 'idle' | 'offline' | 'logged_out';

export interface StatusInfo {
  color: string;
  label: string;
  ring: string;
  textClass: string;
  isOffline: boolean;
  isSignedOut?: boolean;
}

const STATUS_TEXT = {
  vi: {
    online: 'Đang online',
    loggedOut: 'Thoát hệ thống',
    disconnected: 'Ngoại tuyến',
  },
  en: {
    online: 'Online',
    loggedOut: 'Signed out',
    disconnected: 'Disconnected',
  },
};

/**
 * Unified status info for both FamilySidebar and MemberActionSheet.
 * 
 * Status is determined purely from DB `profiles.status` (source of truth).
 * Time display for idle/offline uses `profiles.updated_at` which now only
 * changes on actual status transitions (not on every background location update).
 */
export function getStatusInfo(
  status: UserStatus,
  profileUpdatedAt: string | undefined,
  language: 'vi' | 'en'
): StatusInfo {
  const t = STATUS_TEXT[language];

  // For idle/offline, show time since status changed
  const statusTimeLabel = profileUpdatedAt
    ? formatRelativeTime(new Date(profileUpdatedAt).getTime(), language)
    : '';

  switch (status) {
    case 'online':
      return {
        color: 'bg-emerald-500',
        label: t.online,
        ring: 'ring-emerald-500/20',
        textClass: 'text-emerald-500',
        isOffline: false,
      };
    case 'idle':
      return {
        color: 'bg-orange-500',
        label: statusTimeLabel,
        ring: 'ring-orange-500/20',
        textClass: 'text-orange-500',
        isOffline: false,
      };
    case 'offline':
      return {
        color: 'bg-purple-500',
        label: t.disconnected,
        ring: 'ring-purple-500/10',
        textClass: 'text-purple-500',
        isOffline: true,
      };
    case 'logged_out':
      return {
        color: 'bg-slate-300',
        label: t.loggedOut,
        ring: 'ring-slate-300/10',
        textClass: 'text-slate-400',
        isOffline: true,
        isSignedOut: true,
      };
    default:
      return {
        color: 'bg-slate-300',
        label: t.disconnected,
        ring: 'ring-slate-300/10',
        textClass: 'text-slate-400',
        isOffline: true,
      };
  }
}
