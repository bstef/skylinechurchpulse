import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDrafts } from './drafts.ts';

const drafts = createDrafts(AsyncStorage);
const SAVE_DELAY_MS = 400;

// Form state that survives the app closing: restores a saved draft once, saves edits
// shortly after they stop, and forgets the draft after a successful save or a discard.
export function useDraftForm<T extends object>(key: string, initial: T | null) {
  const [values, setValues] = useState<T | null>(null);
  const [restored, setRestored] = useState(false);
  const loadedKey = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Wait for the entry or plan to load, and load each form's draft only once.
    if (!initial || loadedKey.current === key) return;
    loadedKey.current = key;
    drafts.load<T>(key).then(draft => {
      setValues(draft ? { ...initial, ...draft } : initial);
      setRestored(!!draft);
    });
  }, [key, initial]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const update = useCallback((patch: Partial<T>) => {
    setValues(current => {
      if (!current) return current;
      const next = { ...current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { drafts.save(key, next); }, SAVE_DELAY_MS);
      return next;
    });
  }, [key]);

  const forget = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await drafts.clear(key);
  }, [key]);

  const discard = useCallback(async () => {
    await forget();
    if (initial) setValues(initial);
    setRestored(false);
  }, [forget, initial]);

  return { values, update, restored, discard, forget };
}
