import type { ShopSettings } from '../../../shared/domain';
import { mutate, read, type MutationResult } from '../data/mutate';
import { nowIso } from '../core/id';
import type { z } from 'zod';
import type { settingsUpdateSchema } from '../validation/schemas';

type SettingsInput = z.infer<typeof settingsUpdateSchema>;

export function getSettings(): ShopSettings {
  return read().settings;
}

export async function updateSettings(patch: Partial<SettingsInput>): Promise<MutationResult<ShopSettings>> {
  return mutate((draft) => {
    draft.settings = {
      ...draft.settings,
      ...patch,
      updatedAt: nowIso(),
    };
    return draft.settings;
  });
}
