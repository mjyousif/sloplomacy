import { AlertTriangle, Anchor, Crosshair, MoveRight } from 'lucide-react';
import type React from 'react';
import { CollapsibleSection } from '../CollapsibleSection';
import styles from './MapLegendSection.module.css';

export const MapLegendSection: React.FC = () => {
  return (
    <CollapsibleSection
      title="TACTICAL MAP LEGEND"
      collapsible={true}
      defaultOpen={true}
    >
      <div className={styles.toolsLegendGrid}>
        <div className={styles.legendItem} title="Army or Fleet movement arrow">
          <span className={styles.legendSwatch} data-swatch="move">
            <MoveRight size={12} />
          </span>
          <span className={styles.legendLabel}>Move / Attack</span>
        </div>
        <div
          className={styles.legendItem}
          title="Fleet convoying an army across sea"
        >
          <span className={styles.legendSwatch} data-swatch="convoy">
            <Anchor size={12} />
          </span>
          <span className={styles.legendLabel}>Fleet Convoy</span>
        </div>
        <div
          className={styles.legendItem}
          title="Support order to hold or move"
        >
          <span className={styles.legendSwatch} data-swatch="support">
            <Crosshair size={12} />
          </span>
          <span className={styles.legendLabel}>Support Link</span>
        </div>
        <div className={styles.legendItem} title="Tactical issue or warning">
          <span className={styles.legendSwatch} data-swatch="warn">
            <AlertTriangle size={12} />
          </span>
          <span className={styles.legendLabel}>Warning</span>
        </div>
      </div>
    </CollapsibleSection>
  );
};
