import { useEffect, useRef, useState } from 'react';

const SHOWN_MS = 2500;

/**
 * Copies text to the clipboard and remembers, for a moment, which button did it, so that
 * button can say "Copied". `copied` is the id passed to the last `copy`, or null.
 */
export function useCopyFeedback() {
  const [copied, setCopied] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = (text: string, id: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(id);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(null), SHOWN_MS);
  };

  return { copied, copy };
}
