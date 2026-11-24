import { ChevronLeft, ChevronRight } from 'lucide-react';
import type React from 'react';
import { Button } from '../ui/Button';
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
    <Button
      variant="secondary"
      size="sm"
      className={styles.button}
      disabled={page <= 1}
      onClick={() => onPage(page - 1)}
    >
      <ChevronLeft size={14} />
      <span>Prev</span>
    </Button>
    <span className={styles.label}>
      Page {page} of {pages}
    </span>
    <Button
      variant="secondary"
      size="sm"
      className={styles.button}
      disabled={page >= pages}
      onClick={() => onPage(page + 1)}
    >
      <span>Next</span>
      <ChevronRight size={14} />
    </Button>
  </nav>
);
