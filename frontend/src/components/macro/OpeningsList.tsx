import {
  BookOpen,
  ExternalLink,
  Handshake,
  Minus,
  Plus,
  Swords,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { OpeningApproach, OpeningRelation } from '../../data/openings';
import type { Power } from '../../types/diplomacy';
import { powerShortName } from '../../utils/powerHelpers';
import { Button } from '../ui/Button';
import { PowerFlag } from '../ui/PowerFlag';
import styles from './OpeningsList.module.css';
import type { OpeningEntry, OpeningsPanel } from './useOpeningsPanel';

/**
 * Brings an opened row's details into view by scrolling only the list's own scroller (the
 * panel's card list, or the phone sheet's body), never the page around it.
 */
function revealRow(row: HTMLElement | null) {
  // On a phone the sheet body scrolls; the card list inside it does not.
  const scroller =
    row?.closest<HTMLElement>('[data-testid="bottom-sheet-body"]') ??
    row?.closest<HTMLElement>('[data-testid="macro-units-scroll-area"]');
  if (!row || !scroller) return;
  const rowRect = row.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  // A lowered phone sheet runs off the bottom of the screen, so the screen's edge counts.
  const bottom = Math.min(box.bottom, window.innerHeight);
  const below = rowRect.bottom - bottom + 8;
  if (below > 0) {
    scroller.scrollTop += Math.min(below, rowRect.top - box.top - 8);
  }
}

const APPROACH_LABEL: Record<OpeningApproach, string> = {
  standard: 'Standard',
  defensive: 'Defensive',
  flexible: 'Flexible',
  aggressive: 'Aggressive',
  gambit: 'Gambit',
};

/** A power the opening is aimed against (crossed swords) or works with (a handshake). */
const RelationChip: React.FC<{ relation: OpeningRelation }> = ({
  relation,
}) => {
  const label = `${relation.kind === 'against' ? 'Against' : 'With'} ${powerShortName(relation.power)}`;
  const Icon = relation.kind === 'against' ? Swords : Handshake;
  return (
    <span
      className={styles.relation}
      data-kind={relation.kind}
      data-testid="opening-relation"
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon size={11} aria-hidden="true" />
      <PowerFlag
        power={relation.power}
        width={15}
        height={10}
        aria-hidden="true"
      />
    </span>
  );
};

/** "A VEN - TYR" as the order cards write a move. */
const orderText = (text: string) => text.replace(' - ', ' → ');

/**
 * The order panel's Openings button. It sits beside Clear All, and swaps the unit cards for the
 * list of book openings while it is pressed.
 */
export const OpeningsButton: React.FC<{ panel: OpeningsPanel }> = ({
  panel,
}) => (
  <button
    type="button"
    className={styles.openingsBtn}
    data-testid="btn-openings"
    aria-pressed={panel.open}
    title="Book openings for Spring 1901, from the UK Diplomacy Zine Archive"
    onClick={panel.toggle}
  >
    <BookOpen size={12} aria-hidden="true" /> Openings
  </button>
);

const OpeningRow: React.FC<{
  entry: OpeningEntry;
  selected: boolean;
  onSelect: () => void;
  onUse: () => Promise<string | null>;
}> = ({ entry, selected, onSelect, onUse }) => {
  const { opening, orders } = entry;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fits = orders !== null;
  const rowRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (selected) revealRow(rowRef.current);
    // A refusal belongs to that attempt; reopening the row starts clean.
    else setError(null);
  }, [selected]);

  const use = async () => {
    setBusy(true);
    setError(null);
    const problem = await onUse();
    setBusy(false);
    if (problem) setError(problem);
  };

  return (
    <li
      ref={rowRef}
      className={styles.row}
      data-testid="opening-row"
      data-opening={opening.id}
      data-selected={selected ? 'true' : undefined}
      data-unavailable={fits ? undefined : 'true'}
    >
      <button
        type="button"
        className={styles.rowHead}
        aria-expanded={selected}
        disabled={!fits}
        onClick={onSelect}
        title={
          fits
            ? selected
              ? 'Take it off the map'
              : 'Show it on the map'
            : 'Your units are no longer where this opening starts'
        }
      >
        <span className={styles.rowTitle}>
          <span className={styles.name}>{opening.name}</span>
          <span className={styles.meta}>
            {opening.popularity !== null && (
              <span className={styles.popularity}>
                {opening.popularity.toFixed(opening.popularity < 10 ? 1 : 0)}%
                of games
              </span>
            )}
          </span>
        </span>
        <span className={styles.tags}>
          <span
            className={styles.approach}
            data-approach={opening.approach}
            data-testid="opening-approach"
          >
            {APPROACH_LABEL[opening.approach]}
          </span>
          {opening.relations.map((relation) => (
            <RelationChip
              key={relation.kind + relation.power}
              relation={relation}
            />
          ))}
        </span>
        <span className={styles.orders}>
          {opening.orders.map((text) => (
            <span key={text}>{orderText(text)}</span>
          ))}
        </span>
      </button>

      {selected && (
        <div className={styles.detail} data-testid="opening-detail">
          <ul className={styles.points} aria-label="Strengths">
            {opening.strengths.map((s) => (
              <li key={s} data-kind="strength">
                <Plus size={11} aria-hidden="true" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
          <ul className={styles.points} aria-label="Weaknesses">
            {opening.weaknesses.map((w) => (
              <li key={w} data-kind="weakness">
                <Minus size={11} aria-hidden="true" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
          {opening.followUp && (
            <p className={styles.followUp}>{opening.followUp}</p>
          )}
          <p className={styles.sources}>
            From{' '}
            {opening.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && (i === opening.sources.length - 1 ? ' and ' : ', ')}
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                  <ExternalLink size={9} aria-hidden="true" />
                </a>{' '}
                ({s.author})
              </span>
            ))}
          </p>
          <Button
            variant="primary"
            size="sm"
            fullWidth
            data-testid="opening-use"
            disabled={busy}
            onClick={use}
            title="Fill in these orders. Nothing is finalized."
          >
            Use these orders
          </Button>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
};

/** The book openings for the power, in place of its unit cards. */
export const OpeningsList: React.FC<{ panel: OpeningsPanel; power: Power }> = ({
  panel,
  power,
}) => (
  <section
    className={styles.list}
    data-testid="openings-list"
    aria-label="Spring 1901 openings"
  >
    <div className={styles.header}>
      <span>{powerShortName(power)} openings</span>
      <button
        type="button"
        className={styles.closeBtn}
        data-testid="openings-close"
        aria-label="Back to your units"
        title="Back to your units"
        onClick={panel.close}
      >
        <X size={14} />
      </button>
    </div>
    <p className={styles.hint}>
      Pick one to see it on the map. Using it fills in your orders; nothing is
      finalized.
    </p>
    <ul className={styles.rows}>
      {panel.entries.map((entry) => (
        <OpeningRow
          key={entry.opening.id}
          entry={entry}
          selected={panel.selectedId === entry.opening.id}
          onSelect={() => panel.select(entry)}
          onUse={() => panel.use(entry)}
        />
      ))}
    </ul>
  </section>
);
