import type React from 'react';
import { cx } from '../../utils/cx';
import styles from './Modal.module.css';

/** Native attributes for the backdrop or the card, plus `data-*` such as a test id. */
type DivProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'className' | 'children' | 'onClick'
> & { [attribute: `data-${string}`]: string | undefined };

/**
 * How the backdrop dims the page. `raised` (the game-over notice) and `emphatic` (surrender) sit
 * above `standard`, and `blocking` (ConfirmModal) above every other modal.
 */
type ModalScrim = 'standard' | 'raised' | 'emphatic' | 'blocking';

/**
 * What the card does on a phone: `scroll` fits the visible height and scrolls when taller,
 * `fit` only limits its height (a card whose body scrolls on its own), `none` leaves the card
 * alone.
 */
type ModalPhoneFit = 'scroll' | 'fit' | 'none';

interface ModalProps {
  scrim?: ModalScrim;
  /** Phone only; see `ModalPhoneFit`. */
  phone?: ModalPhoneFit;
  /** A click on the dimmed area outside the card. */
  onBackdropClick?: () => void;
  /** Keep clicks inside the card from reaching the page behind it. Defaults to `true` when
   * there is an `onBackdropClick`, which the click would otherwise trigger. */
  isolateClicks?: boolean;
  cardClassName?: string;
  backdropProps?: DivProps;
  cardProps?: DivProps;
  children: React.ReactNode;
}

/**
 * The shell the app's dialogs share: a dimmed backdrop and a card in its middle. It owns what
 * they have in common, the dimming, the card's width and the phone rules (the card fits the
 * visible height); each dialog's own module styles what is inside.
 */
export const Modal: React.FC<ModalProps> = ({
  scrim = 'standard',
  phone = 'scroll',
  onBackdropClick,
  isolateClicks = Boolean(onBackdropClick),
  cardClassName,
  backdropProps,
  cardProps,
  children,
}) => (
  <div
    className={styles.backdrop}
    data-scrim={scrim}
    onClick={onBackdropClick}
    {...backdropProps}
  >
    <div
      className={cx(styles.card, cardClassName)}
      data-phone={phone}
      onClick={isolateClicks ? (e) => e.stopPropagation() : undefined}
      {...cardProps}
    >
      {children}
    </div>
  </div>
);

/** The ✕ in a dialog's header. `className` carries the dialog's own look. */
export const ModalCloseButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ className, ...props }) => (
  <button type="button" className={cx(styles.close, className)} {...props} />
);

/** A dialog's row of buttons: stacked full-width on a phone, the main action on top. */
export const ModalFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={cx(styles.footer, className)} {...props} />;
