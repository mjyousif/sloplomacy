/**
 * Copies `text` to the clipboard and says whether it worked.
 *
 * `navigator.clipboard` only exists on a secure page (https or localhost), so over plain http on
 * a LAN it is missing, and `writeText` also rejects when the page is not focused or the browser
 * refuses. The old `execCommand('copy')` still works on such pages, so it is tried next.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.setAttribute('aria-hidden', 'true');
  Object.assign(field.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    opacity: '0',
    pointerEvents: 'none',
  });
  const previous = document.activeElement as HTMLElement | null;
  document.body.appendChild(field);
  try {
    field.focus();
    field.select();
    return typeof document.execCommand === 'function'
      ? document.execCommand('copy')
      : false;
  } catch {
    return false;
  } finally {
    document.body.removeChild(field);
    previous?.focus?.();
  }
}
