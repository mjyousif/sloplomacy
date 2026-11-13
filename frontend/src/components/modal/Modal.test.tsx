// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal, ModalCloseButton, ModalFooter } from './Modal';

describe('Modal', () => {
  it('draws the card inside the backdrop with the standard scrim and a scrolling card', () => {
    render(
      <Modal
        backdropProps={{ 'data-testid': 'backdrop' }}
        cardProps={{ 'data-testid': 'card', role: 'dialog' }}
      >
        <p>Inside</p>
      </Modal>,
    );
    const backdrop = screen.getByTestId('backdrop');
    expect(backdrop).toHaveAttribute('data-scrim', 'standard');
    expect(screen.getByRole('dialog')).toBe(screen.getByTestId('card'));
    expect(screen.getByTestId('card')).toHaveAttribute('data-phone', 'scroll');
    expect(backdrop).toContainElement(screen.getByTestId('card'));
  });

  it('takes the scrim and scrolling from its props and keeps the card’s class', () => {
    render(
      <Modal
        scrim="blocking"
        phone="fit"
        cardClassName="c"
        backdropProps={{ 'data-testid': 'backdrop' }}
        cardProps={{ 'data-testid': 'card' }}
      >
        x
      </Modal>,
    );
    expect(screen.getByTestId('backdrop')).toHaveAttribute(
      'data-scrim',
      'blocking',
    );
    expect(screen.getByTestId('card')).toHaveAttribute('data-phone', 'fit');
    expect(screen.getByTestId('card')).toHaveClass('c');
  });

  it('calls onBackdropClick for the dimmed area only, not for a click inside the card', async () => {
    const onBackdropClick = vi.fn();
    render(
      <Modal
        onBackdropClick={onBackdropClick}
        backdropProps={{ 'data-testid': 'backdrop' }}
      >
        <button type="button">Inside</button>
      </Modal>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Inside' }));
    expect(onBackdropClick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('backdrop'));
    expect(onBackdropClick).toHaveBeenCalledTimes(1);
  });

  it('keeps clicks inside the card from reaching the page behind it, unless told not to', async () => {
    const behind = vi.fn();
    const { rerender } = render(
      <div onClick={behind}>
        <Modal onBackdropClick={() => {}}>
          <button type="button">Inside</button>
        </Modal>
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Inside' }));
    expect(behind).not.toHaveBeenCalled();

    rerender(
      <div onClick={behind}>
        <Modal>
          <button type="button">Inside</button>
        </Modal>
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Inside' }));
    expect(behind).toHaveBeenCalledTimes(1);
  });

  it('can isolate clicks without a backdrop handler', async () => {
    const behind = vi.fn();
    render(
      <div onClick={behind}>
        <Modal isolateClicks>
          <button type="button">Inside</button>
        </Modal>
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Inside' }));
    expect(behind).not.toHaveBeenCalled();
  });
});

describe('ModalCloseButton and ModalFooter', () => {
  it('renders a button that never submits a form and passes its props through', async () => {
    const onClick = vi.fn();
    render(
      <ModalCloseButton aria-label="Close" onClick={onClick} disabled={false}>
        x
      </ModalCloseButton>,
    );
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not click through a disabled close button', async () => {
    const onClick = vi.fn();
    render(
      <ModalCloseButton aria-label="Close" onClick={onClick} disabled>
        x
      </ModalCloseButton>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('wraps the footer’s buttons and keeps the caller’s class', () => {
    render(
      <ModalFooter className="own" data-testid="footer">
        <button type="button">Cancel</button>
      </ModalFooter>,
    );
    expect(screen.getByTestId('footer')).toHaveClass('own');
    expect(screen.getByTestId('footer')).toContainElement(
      screen.getByRole('button', { name: 'Cancel' }),
    );
  });
});
