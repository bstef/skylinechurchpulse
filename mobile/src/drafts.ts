// Unsaved form drafts, kept on the device so a dropped connection or a closed app
// doesn't lose a half-filled form. Storage is injected so the rules run under node --test.
export type DraftStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const PREFIX = 'pulse.draft.';
// Drafts older than this are dropped rather than restored into a form days later.
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// One draft per form: a new entry (optionally for a Planning Center plan) or an edit of an existing one.
export function draftKey(form: 'service' | 'production', target: { entryId?: string | null; planId?: string | null }): string {
  if (target.entryId) return `${PREFIX}${form}.edit.${target.entryId}`;
  return `${PREFIX}${form}.new.${target.planId ?? 'manual'}`;
}

export function createDrafts(storage: DraftStorage, now: () => number = Date.now) {
  return {
    async load<T>(key: string): Promise<T | null> {
      try {
        const raw = await storage.getItem(key);
        if (!raw) return null;
        const draft = JSON.parse(raw);
        if (typeof draft?.savedAt !== 'number' || now() - draft.savedAt > DRAFT_MAX_AGE_MS || !draft.values) {
          await storage.removeItem(key);
          return null;
        }
        return draft.values as T;
      } catch { return null; }
    },
    save<T>(key: string, values: T): Promise<void> {
      return storage.setItem(key, JSON.stringify({ savedAt: now(), values })).catch(() => {});
    },
    clear(key: string): Promise<void> {
      return storage.removeItem(key).catch(() => {});
    },
  };
}
