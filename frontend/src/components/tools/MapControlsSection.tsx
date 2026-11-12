import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import type React from 'react';
import { CollapsibleSection } from '../CollapsibleSection';
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
      badge={<span className="tools-zoom-badge">{zoomPercent}%</span>}
      collapsible={false}
    >
      <div className="tools-zoom-toolbar">
        <button
          type="button"
          className="tools-btn"
          onClick={onZoomOut}
          title="Zoom Out"
        >
          <ZoomOut size={13} />
          <span>Out</span>
        </button>
        <button
          type="button"
          className="tools-btn"
          onClick={onZoomIn}
          title="Zoom In"
        >
          <ZoomIn size={13} />
          <span>In</span>
        </button>
        <button
          type="button"
          className="tools-btn"
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
