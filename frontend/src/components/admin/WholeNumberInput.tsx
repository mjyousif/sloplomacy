/**
 * A box that takes whole numbers only. A number box still lets people type ".", "-" and "e", so
 * this is a text box that keeps the digits of whatever is typed or pasted, and asks phones for
 * their number keypad.
 */
export function WholeNumberInput({
  id,
  testId,
  value,
  maxDigits,
  onChange,
  ariaLabel,
  className,
}: {
  id: string;
  testId: string;
  value: string;
  maxDigits: number;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <input
      id={id}
      data-testid={testId}
      className={className}
      aria-label={ariaLabel}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={value}
      onChange={(e) =>
        onChange(e.target.value.replace(/\D/g, '').slice(0, maxDigits))
      }
    />
  );
}
