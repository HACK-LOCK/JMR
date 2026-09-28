import type { ApiWarning } from '../../../shared/domain';
import { getStore } from './index';
import type { Database } from './database';

export interface MutationResult<T> {
  data: T;
  warning?: ApiWarning;
}

/**
 * Single entry point for every write in the app.
 * Business services never touch the store directly, so persistence, queueing
 * and the "saved but not synced yet" warning behave identically everywhere.
 */
export async function mutate<T>(fn: (draft: Database) => T): Promise<MutationResult<T>> {
  const result = await getStore().commitChecked(fn);
  return result.warning ? { data: result.value, warning: result.warning } : { data: result.value };
}

export function read(): Database {
  return getStore().snapshot();
}
