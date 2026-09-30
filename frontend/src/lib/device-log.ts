import { useQuery } from '@tanstack/react-query';
import { request } from './api';

export interface DeviceLogEntry {
  id: string;
  ts: string;
  devId: string;
  devName: string;
  user?: string;
  action: 'LOGIN' | 'NEW_BILL' | 'EDIT_BILL' | 'STATUS' | 'PAYMENT' | 'PART' | 'OTHER';
  tag: string;
  orderId?: string;
  detail?: string;
}

const DEV_ID_KEY = 'jmr_device_id';
const DEV_NAME_KEY = 'jmr_device_name';
const LOCAL_LOGS_KEY = 'jmr_local_device_logs';
const MAX_LOCAL_LOGS = 200;

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEV_ID_KEY);
    if (!id) {
      id = 'DEV-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      localStorage.setItem(DEV_ID_KEY, id);
    }
    return id;
  } catch {
    return 'DEV-TEMP';
  }
}

function detectPlatformAndBrowser(): string {
  if (typeof navigator === 'undefined') return 'Web Device';
  const ua = navigator.userAgent || '';
  let os = 'PC';
  if (/android/i.test(ua)) os = 'Android Mobile';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iPhone/iPad';
  else if (/windows/i.test(ua)) os = 'Windows PC';
  else if (/macintosh|mac os x/i.test(ua)) os = 'Mac Desktop';
  else if (/linux/i.test(ua)) os = 'Linux PC';

  let browser = 'Browser';
  if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/edge|edg/i.test(ua)) browser = 'Edge';
  else if (/firefox/i.test(ua)) browser = 'Firefox';

  return `${os} (${browser})`;
}

export function getDeviceName(): string {
  try {
    const custom = localStorage.getItem(DEV_NAME_KEY);
    if (custom && custom.trim()) return custom.trim();
    const auto = detectPlatformAndBrowser();
    localStorage.setItem(DEV_NAME_KEY, auto);
    return auto;
  } catch {
    return 'Shop Device';
  }
}

export function setDeviceName(name: string): string {
  const trimmed = name.trim() || detectPlatformAndBrowser();
  try {
    localStorage.setItem(DEV_NAME_KEY, trimmed);
  } catch {
    /* ignore */
  }
  return trimmed;
}

function getLocalCachedLogs(): DeviceLogEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalCachedLog(entry: DeviceLogEntry): void {
  try {
    const existing = getLocalCachedLogs();
    const updated = [entry, ...existing.filter((item) => item.id !== entry.id)].slice(0, MAX_LOCAL_LOGS);
    localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(updated));
  } catch {
    /* ignore */
  }
}

export async function logDeviceActivity(input: {
  action: DeviceLogEntry['action'];
  tag: string;
  orderId?: string;
  detail?: string;
  user?: string;
}): Promise<void> {
  const devId = getDeviceId();
  const devName = getDeviceName();

  const entry: DeviceLogEntry = {
    id: `l_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    devId,
    devName,
    user: input.user || 'admin',
    action: input.action,
    tag: input.tag,
    orderId: input.orderId,
    detail: input.detail,
  };

  // Cache locally first for instant offline availability
  saveLocalCachedLog(entry);

  // Sync to backend API (fire and forget)
  try {
    await request<DeviceLogEntry>('/device-logs', {
      method: 'POST',
      body: entry,
    });
  } catch {
    // If backend is unreachable or local file mode, it remains safely cached in localStorage
  }
}

export function useDeviceLogs() {
  return useQuery<DeviceLogEntry[]>({
    queryKey: ['device-logs'],
    queryFn: async () => {
      try {
        const envelope = await request<DeviceLogEntry[]>('/device-logs');
        if (envelope?.data && Array.isArray(envelope.data)) {
          // Merge with local logs if any are missing
          const local = getLocalCachedLogs();
          const map = new Map<string, DeviceLogEntry>();
          for (const item of envelope.data) map.set(item.id, item);
          for (const item of local) {
            if (!map.has(item.id)) map.set(item.id, item);
          }
          return Array.from(map.values())
            .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
            .slice(0, MAX_LOCAL_LOGS);
        }
      } catch {
        /* fallback to local cached logs */
      }
      return getLocalCachedLogs();
    },
    staleTime: 5000,
    refetchInterval: 10000,
  });
}
