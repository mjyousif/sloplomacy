import { ChevronLeft, ChevronRight } from 'lucide-react';
import type React from 'react';

export interface GameBrowserPagerProps {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}

export const GameBrowserPager: React.FC<GameBrowserPagerProps> = ({
  page,
  pages,
  onPage,
}) => (
  <nav className="browser-pager" aria-label="Game pages">
    <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
      <ChevronLeft size={14} />
      <span>Prev</span>
    </button>
    <span className="browser-pager-label">
      Page {page} of {pages}
    </span>
    <button
      type="button"
      disabled={page >= pages}
      onClick={() => onPage(page + 1)}
    >
      <span>Next</span>
      <ChevronRight size={14} />
    </button>
  </nav>
);
