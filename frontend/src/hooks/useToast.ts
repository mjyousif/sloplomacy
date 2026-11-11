import { useState } from 'react';

/** How long a toast stays up, in milliseconds. */
export const TOAST_DURATION_MS = 4500;

/**
 * The one toast banner under the top bar. A new message replaces the one showing, and each
 * message clears itself after a few seconds unless a newer one has taken its place.
 */
export function useToast() {
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastBanner(msg);
    setTimeout(() => {
      setToastBanner((prev) => (prev === msg ? null : prev));
    }, TOAST_DURATION_MS);
  };

  return { toastBanner, triggerToast };
}
