import { useEffect, useState } from 'react';
import styles from './DurationPicker.module.css';
import { WholeNumberInput } from './WholeNumberInput';

const UNITS = [
  { value: 1, label: 'min' },
  { value: 60, label: 'hours' },
  { value: 24 * 60, label: 'days' },
] as const;

/** The biggest unit a length divides into evenly, so 2880 min reads as 2 days. */
function splitIntoUnit(minutes: number): { amount: string; unit: number } {
  for (const unit of [...UNITS].reverse()) {
    if (minutes % unit.value === 0)
      return { amount: String(minutes / unit.value), unit: unit.value };
  }
  return { amount: String(minutes), unit: 1 };
}

export interface DurationPickerProps {
  id: string;
  label: string;
  testId: string;
  /** Minutes, or null while the box is empty. */
  value: number | null;
  onChange: (minutes: number | null) => void;
}

/**
 * Picks a length of time (issue #393): a whole number and its unit (min, hours or days). An
 * empty box is null.
 */
export function DurationPicker({
  id,
  label,
  testId,
  value,
  onChange,
}: DurationPickerProps) {
  const [amount, setAmount] = useState(() =>
    value !== null ? splitIntoUnit(value).amount : '',
  );
  const [unit, setUnit] = useState<number>(() =>
    value !== null ? splitIntoUnit(value).unit : 1,
  );

  // A length set from outside (saved lengths, a new turn) refills the boxes, in its biggest unit.
  useEffect(() => {
    const shown = amount === '' ? null : Number(amount) * unit;
    if (shown === value) return;
    if (value === null) {
      setAmount('');
      return;
    }
    const split = splitIntoUnit(value);
    setAmount(split.amount);
    setUnit(split.unit);
  }, [value]);

  const update = (nextAmount: string, nextUnit: number) => {
    setAmount(nextAmount);
    setUnit(nextUnit);
    onChange(nextAmount === '' ? null : Number(nextAmount) * nextUnit);
  };

  return (
    <fieldset className={styles.picker} data-testid={testId}>
      <legend className={styles.legend}>{label}</legend>
      <div className={styles.row}>
        <WholeNumberInput
          id={`${id}-amount`}
          testId={`${testId}-amount`}
          ariaLabel={`${label}: amount`}
          className={styles.amount}
          maxDigits={5}
          value={amount}
          onChange={(next) => update(next, unit)}
        />
        <select
          className={styles.unit}
          aria-label={`${label}: unit`}
          data-testid={`${testId}-unit`}
          value={unit}
          onChange={(e) => update(amount, Number(e.target.value))}
        >
          {UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
