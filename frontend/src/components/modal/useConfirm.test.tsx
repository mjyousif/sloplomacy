// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { type ConfirmOptions, useConfirm } from './ConfirmModal';

const DESTROY: ConfirmOptions = {
  title: 'Destroy this unit?',
  message: 'France Army in PAR will be removed from the board.',
  confirmLabel: 'Destroy',
};

/** A button that asks before acting, the way App and the admin tabs use `useConfirm`. */
function Harness({ onAnswer }: { onAnswer: (ok: boolean) => void }) {
  const { confirm, confirmModal } = useConfirm();
  return (
    <>
      <button
        type="button"
        onClick={async (e) => onAnswer(await confirm(DESTROY, e))}
      >
        Destroy unit
      </button>
      {confirmModal}
    </>
  );
}

function setup() {
  const answers: boolean[] = [];
  const user = userEvent.setup();
  render(<Harness onAnswer={(ok) => answers.push(ok)} />);
  return { answers, user };
}

describe('useConfirm', () => {
  it('asks first and goes ahead on Confirm', async () => {
    const { answers, user } = setup();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Destroy unit' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Destroy this unit?');
    expect(dialog).toHaveAccessibleDescription(DESTROY.message);
    // The action has focus, so Enter confirms.
    expect(screen.getByTestId('btn-confirm-modal-confirm')).toHaveFocus();

    await user.click(screen.getByTestId('btn-confirm-modal-confirm'));
    expect(answers).toEqual([true]);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it.each([
    [
      'the Cancel button',
      (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByText('Cancel')),
    ],
    [
      'the close button',
      (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByLabelText('Cancel')),
    ],
    [
      'Escape',
      (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}'),
    ],
  ])('does nothing when dismissed with %s', async (_how, dismiss) => {
    const { answers, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Destroy unit' }));
    await dismiss(user);
    expect(answers).toEqual([false]);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('skips the question when Shift is held', async () => {
    const { answers, user } = setup();
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('button', { name: 'Destroy unit' }));
    await user.keyboard('{/Shift}');
    expect(answers).toEqual([true]);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('counts an unanswered question as cancelled when a new one replaces it', async () => {
    const { answers, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Destroy unit' }));
    await user.click(screen.getByRole('button', { name: 'Destroy unit' }));
    expect(answers).toEqual([false]);
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    await user.click(screen.getByTestId('btn-confirm-modal-confirm'));
    expect(answers).toEqual([false, true]);
  });
});
