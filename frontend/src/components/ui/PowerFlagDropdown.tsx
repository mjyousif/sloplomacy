import { ALL_POWERS, POWER_METADATA, type Power } from '../../types/diplomacy';
import {
  IconSelectDropdown,
  type IconSelectDropdownClassNames,
} from './IconSelectDropdown';
import { PowerFlag } from './PowerFlag';

export interface PowerFlagDropdownProps {
  id?: string;
  testId?: string;
  value: Power | null;
  onChange: (power: Power | null) => void;
  includeNeutral?: boolean;
  neutralLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  useNative?: boolean;
  classNames?: IconSelectDropdownClassNames;
}

/** Country selector displaying historical PowerFlags alongside power names. */
export function PowerFlagDropdown({
  id,
  testId,
  value,
  onChange,
  includeNeutral = false,
  neutralLabel = 'Neutral (Unowned)',
  placeholder = 'Select Country…',
  disabled = false,
  useNative = false,
  classNames,
}: PowerFlagDropdownProps) {
  return (
    <IconSelectDropdown<Power>
      id={id}
      testId={testId}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      useNative={useNative}
      classNames={classNames}
      emptyOption={
        includeNeutral
          ? {
              label: neutralLabel,
              testId: testId ? `${testId}-option-neutral` : undefined,
            }
          : undefined
      }
      options={ALL_POWERS.map((p) => ({
        value: p,
        label: POWER_METADATA[p].shortName,
        icon: <PowerFlag power={p} width={18} height={12} />,
        testId: testId ? `${testId}-option-${p.toLowerCase()}` : undefined,
      }))}
    />
  );
}
