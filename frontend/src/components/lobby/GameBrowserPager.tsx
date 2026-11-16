import { ChevronLeft, ChevronRight } from 'lucide-react';
import type React from 'react';
import styles from './GameBrowserPager.module.css';

export interface GameBrowserPagerProps {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}

/** Prev and Next under the browser's list, with where the player is. */
export const GameBrowserPager: React.FC<GameBrowserPagerProps> = ({
  page,
  pages,
  onPage,
}) => (
  <nav className={styles.pager} aria-label="Game pages">
    <button
      type="button"
      className={styles.button}
      disabled={page <= 1}
      onClick={() => onPage(page - 1)}
    >
      <ChevronLeft size={14} />
      <span>Prev</span>
    </button>
    <span className={styles.label}>
      Page {page} of {pages}
    </span>
    <button
      type="button"
      className={styles.button}
      disabled={page >= pages}
      onClick={() => onPage(page + 1)}
    >
      <span>Next</span>
      <ChevronRight size={14} />
    </button>
  </nav>
);
