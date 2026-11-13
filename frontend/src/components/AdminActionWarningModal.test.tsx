// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminActionLogEntry } from '../types/diplomacy';
import { AdminActionWarningModal } from './AdminActionWarningModal';

const ENTRIES: AdminActionLogEntry[] = [
  {
    id: 'entry-1',
    timestamp: '2026-11-12T00:00:00Z',
    actor: 'admin@diplomacy.eu',
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
    summary_lines: [
      '[ADMIN OVERRIDE] Relocated GERMANY A from BER to SYR.',
      '[ADMIN OVERRIDE] Set ownership of BEL to FRANCE.',
    ],
    acknowledged_by: [],
  },
];

describe('AdminActionWarningModal', () => {
  it('renders nothing when not open or entries are empty', () => {
    const { container: c1 } = render(
      <AdminActionWarningModal
        isOpen={false}
        entries={ENTRIES}
        onAcknowledge={vi.fn()}
      />,
    );
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(
      <AdminActionWarningModal
        isOpen={true}
        entries={[]}
        onAcknowledge={vi.fn()}
      />,
    );
    expect(c2).toBeEmptyDOMElement();
  });

  it('renders the warning notice with turn badge, actor, and clean summary lines', () => {
    render(
      <AdminActionWarningModal
        isOpen={true}
        entries={ENTRIES}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(
      screen.getByText('ADMINISTRATIVE INTERVENTION NOTICE'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Match State Modified by Administrator'),
    ).toBeInTheDocument();
    expect(screen.getByText('Spring 1901 Movement')).toBeInTheDocument();
    expect(screen.getByText('admin@diplomacy.eu')).toBeInTheDocument();
    expect(
      screen.getByText('Relocated GERMANY A from BER to SYR.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Set ownership of BEL to FRANCE.'),
    ).toBeInTheDocument();
  });

  it('calls onAcknowledge when clicking Acknowledge & Continue', () => {
    const handleAck = vi.fn();
    render(
      <AdminActionWarningModal
        isOpen={true}
        entries={ENTRIES}
        onAcknowledge={handleAck}
      />,
    );

    const btn = screen.getByRole('button', { name: 'Acknowledge & Continue' });
    fireEvent.click(btn);
    expect(handleAck).toHaveBeenCalledTimes(1);
  });

  it('disables the button and indicates loading when acknowledging', () => {
    render(
      <AdminActionWarningModal
        isOpen={true}
        entries={ENTRIES}
        onAcknowledge={vi.fn()}
        loading={true}
      />,
    );

    const btn = screen.getByRole('button', { name: 'Acknowledging...' });
    expect(btn).toBeDisabled();
  });
});
