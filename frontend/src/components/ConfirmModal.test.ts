import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ConfirmModal, skipsConfirmation } from './ConfirmModal';

describe('ConfirmModal', () => {
  it('shows the question, the action and the Shift tip', () => {
    const html = renderToString(
      React.createElement(ConfirmModal, {
        title: 'Destroy this unit?',
        message: 'France Army in PAR will be removed from the board.',
        confirmLabel: 'Destroy',
        onConfirm: () => {},
        onCancel: () => {},
      }),
    );
    expect(html).toContain('Destroy this unit?');
    expect(html).toContain('France Army in PAR');
    expect(html).toContain('>Destroy<');
    expect(html).toContain('Shift');
    expect(html).toContain('role="alertdialog"');
  });

  it('is skipped only when Shift was held', () => {
    expect(skipsConfirmation({ shiftKey: true })).toBe(true);
    expect(skipsConfirmation({ shiftKey: false })).toBe(false);
    expect(skipsConfirmation(undefined)).toBe(false);
    expect(skipsConfirmation(null)).toBe(false);
  });
});
