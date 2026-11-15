// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SaveSandboxModal } from './SaveSandboxModal';

describe('SaveSandboxModal', () => {
  it('does not render when isOpen is false', () => {
    render(
      <SaveSandboxModal
        isOpen={false}
        defaultName="French Opening Study"
        saving={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('save-sandbox-modal')).not.toBeInTheDocument();
  });

  it('renders with default name pre-filled and handles saving a custom name', async () => {
    const user = userEvent.setup();
    const handleSave = vi.fn();
    const handleCancel = vi.fn();

    render(
      <SaveSandboxModal
        isOpen={true}
        defaultName="Initial Sandbox Study"
        saving={false}
        onSave={handleSave}
        onCancel={handleCancel}
      />,
    );

    const input = screen.getByTestId('input-sandbox-name') as HTMLInputElement;
    expect(input.value).toBe('Initial Sandbox Study');

    await user.clear(input);
    await user.type(input, 'My Awesome Tactical Maneuver');
    await user.click(screen.getByTestId('btn-confirm-save-sandbox'));

    expect(handleSave).toHaveBeenCalledTimes(1);
    expect(handleSave).toHaveBeenCalledWith('My Awesome Tactical Maneuver');
    expect(handleCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when clicking Cancel, close icon, or pressing Escape', async () => {
    const user = userEvent.setup();
    const handleCancel = vi.fn();

    const { rerender } = render(
      <SaveSandboxModal
        isOpen={true}
        defaultName="Study"
        saving={false}
        onSave={vi.fn()}
        onCancel={handleCancel}
      />,
    );

    await user.click(screen.getByTestId('btn-cancel-save-sandbox'));
    expect(handleCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('btn-close-save-sandbox'));
    expect(handleCancel).toHaveBeenCalledTimes(2);

    await user.keyboard('{Escape}');
    expect(handleCancel).toHaveBeenCalledTimes(3);

    // When saving is in progress, escape is ignored
    rerender(
      <SaveSandboxModal
        isOpen={true}
        defaultName="Study"
        saving={true}
        onSave={vi.fn()}
        onCancel={handleCancel}
      />,
    );
    await user.keyboard('{Escape}');
    expect(handleCancel).toHaveBeenCalledTimes(3);
  });
});
