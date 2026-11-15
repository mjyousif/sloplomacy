/** How much of the map's left and right edges a wide sidebar covers, in element pixels. */
export interface MapInsets {
  left: number;
  right: number;
}

/**
 * The sidebars float over the map (#272), and the workspace says how far through
 * `--map-inset-left` / `--map-inset-right` (`GameWorkspace.module.css`). They inherit, so any
 * element inside the map can read them. A phone, or a test without the stylesheet, reads 0.
 */
export function readMapInsets(el: Element | null | undefined): MapInsets {
  if (!el || typeof getComputedStyle === 'undefined')
    return { left: 0, right: 0 };
  const style = getComputedStyle(el);
  const read = (name: string) =>
    Math.max(0, parseFloat(style.getPropertyValue(name)) || 0);
  return { left: read('--map-inset-left'), right: read('--map-inset-right') };
}
