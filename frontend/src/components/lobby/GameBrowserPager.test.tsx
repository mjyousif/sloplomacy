// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GameBrowserPager } from './GameBrowserPager';

describe('GameBrowserPager', () => {
  it('steps back and forward', async () => {
    const user = userEvent.setup();
    const onPage = vi.fn();
    render(<GameBrowserPager page={2} pages={3} onPage={onPage} />);
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Prev/ }));
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(onPage.mock.calls).toEqual([[1], [3]]);
  });

  it('stops at both ends', () => {
    const { rerender } = render(
      <GameBrowserPager page={1} pages={2} onPage={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Prev/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Next/ })).toBeEnabled();
    rerender(<GameBrowserPager page={2} pages={2} onPage={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });
});
