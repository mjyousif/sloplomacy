/** Joins class names, skipping anything falsy: `cx(styles.tab, active && styles.active)`. */
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}
