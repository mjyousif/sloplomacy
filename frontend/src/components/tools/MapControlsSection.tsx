import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import type React from 'react';
import { CollapsibleSection } from '../CollapsibleSection';
import styles from './MapControlsSection.module.css';
import buttonStyles from './ToolsButton.module.css';
import type { ToolsSidebarProps } from './toolsSidebarProps';

export type MapControlsSectionProps = Pick<
  ToolsSidebarProps,
  'zoomPercent' | 'onZoomIn' | 'onZoomOut' | 'onResetCamera'
>;

export const MapControlsSection: React.FC<MapControlsSectionProps> = ({
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onResetCamera,
}) => {
  return (
    <CollapsibleSection
      title="MAP VIEW & CAMERA"
      badge={
        <span className={styles.toolsZoomBadge} data-testid="tools-zoom-badge">
          {zoomPercent}%
        </span>
      }
      collapsible={false}
    >
      <div className={styles.toolsZoomToolbar} data-testid="tools-zoom-toolbar">
        <button
          type="button"
          className={buttonStyles.toolsBtn}
          onClick={onZoomOut}
          title="Zoom Out"
        >
          <ZoomOut size={13} />
          <span>Out</span>
        </button>
        <button
          type="button"
          className={buttonStyles.toolsBtn}
          onClick={onZoomIn}
          title="Zoom In"
        >
          <ZoomIn size={13} />
          <span>In</span>
        </button>
        <button
          type="button"
          className={buttonStyles.toolsBtn}
          onClick={onResetCamera}
          title="Reset Map to 105% Default View"
        >
          <Maximize2 size={13} />
          <span>Fit Map</span>
        </button>
      </div>
    </CollapsibleSection>
  );
};
