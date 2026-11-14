import type { IconSelectDropdownClassNames } from '../../map/hud/IconSelectDropdown';
import styles from '../OrderParameterControls.module.css';

/** How the order controls' dropdowns look inside an `orderParamInline` row. */
export const orderParamDropdownClassNames: IconSelectDropdownClassNames = {
  root: styles.orderParamDropdown,
  trigger: styles.orderParamTrigger,
  value: styles.orderParamValue,
  menu: styles.orderParamMenu,
};
