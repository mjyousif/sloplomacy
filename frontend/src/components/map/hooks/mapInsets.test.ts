// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readMapInsets } from './mapInsets';

describe('readMapInsets', () => {
  it('reads the sidebar insets an element inherits', () => {
    const parent = document.createElement('div');
    parent.style.setProperty('--map-inset-left', '360px');
    parent.style.setProperty('--map-inset-right', '44px');
    const child = document.createElement('div');
    parent.appendChild(child);
    document.body.appendChild(parent);
    expect(readMapInsets(child)).toEqual({ left: 360, right: 44 });
    parent.remove();
  });

  it('reads 0 with no element or no insets', () => {
    expect(readMapInsets(null)).toEqual({ left: 0, right: 0 });
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(readMapInsets(el)).toEqual({ left: 0, right: 0 });
    el.remove();
  });
});
