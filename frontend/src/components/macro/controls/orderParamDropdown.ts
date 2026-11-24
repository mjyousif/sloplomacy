import type { IconSelectDropdownClassNames } from '../../ui/IconSelectDropdown';
import styles from '../OrderParameterControls.module.css';

/** How the order controls' dropdowns look inside an `orderParamInline` row or standalone compact slot. */
export const orderParamDropdownClassNames: IconSelectDropdownClassNames = {
  root: styles.orderParamDropdown,
  trigger: styles.orderParamTrigger,
  value: styles.orderParamValue,
  menu: styles.orderParamMenu,
  native: styles.orderParamNative,
};
