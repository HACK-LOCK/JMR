import fsp from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';

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

const MAX_LOGS = 200;
const FILE_NAME = 'device-logs.json';

class DeviceLogService {
  private filePath: string;
  private logs: DeviceLogEntry[] = [];
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.filePath = path.join(env.dataDir, FILE_NAME);
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const content = await fsp.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        this.logs = parsed.slice(0, MAX_LOGS);
      }
    } catch {
      this.logs = [];
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue
      .then(async () => {
        await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        await fsp.writeFile(tmp, JSON.stringify(this.logs, null, 2), 'utf8');
        await fsp.rename(tmp, this.filePath);
      })
      .catch((err) => {
        console.error('[DeviceLogService] Failed to persist logs:', err);
      });
    return this.writeQueue;
  }

  async getLogs(): Promise<DeviceLogEntry[]> {
    await this.load();
    return [...this.logs];
  }

  async recordLog(input: Omit<DeviceLogEntry, 'id' | 'ts'> & { ts?: string }): Promise<DeviceLogEntry> {
    await this.load();
    const entry: DeviceLogEntry = {
      id: `l_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ts: input.ts || new Date().toISOString(),
      devId: input.devId || 'UNKNOWN',
      devName: input.devName || 'Unknown Device',
      user: input.user || 'admin',
      action: input.action || 'OTHER',
      tag: input.tag || 'Action',
      orderId: input.orderId,
      detail: input.detail,
    };

    // Prepend and cap to MAX_LOGS to keep memory footprint tiny (< 25KB)
    this.logs.unshift(entry);
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(0, MAX_LOGS);
    }

    void this.persist();
    return entry;
  }
}

export const deviceLogService = new DeviceLogService();
