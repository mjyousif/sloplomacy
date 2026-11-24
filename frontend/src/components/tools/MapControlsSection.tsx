import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import type React from 'react';
import { Button } from '../ui/Button';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import styles from './MapControlsSection.module.css';
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
        <Button
          variant="secondary"
          size="sm"
          onClick={onZoomOut}
          title="Zoom Out"
        >
          <ZoomOut size={13} />
          <span>Out</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onZoomIn}
          title="Zoom In"
        >
          <ZoomIn size={13} />
          <span>In</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onResetCamera}
          title="Reset Map to 100% Default View"
        >
          <Maximize2 size={13} />
          <span>Fit Map</span>
        </Button>
      </div>
    </CollapsibleSection>
  );
};
