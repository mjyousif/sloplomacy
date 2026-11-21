import { useCallback, useEffect, useRef, useState } from 'react';
import { copyText } from '../utils/clipboard';

const SHOWN_MS = 2500;

interface CopyResult {
  id: string;
  ok: boolean;
}

/**
 * Copies text to the clipboard and remembers, for a moment, which button did it and whether it
 * worked, so that button can say "Copied" or that the copy failed. `copied` is the id passed to
 * the last `copy` when it worked and `failed` when it did not; both are otherwise null.
 */
export function useCopyFeedback() {
  const [result, setResult] = useState<CopyResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(async (text: string, id: string) => {
    const ok = await copyText(text);
    if (!mountedRef.current) return ok;
    setResult({ id, ok });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setResult(null), SHOWN_MS);
    return ok;
  }, []);

  return {
    copied: result?.ok ? result.id : null,
    failed: result && !result.ok ? result.id : null,
    copy,
  };
}
