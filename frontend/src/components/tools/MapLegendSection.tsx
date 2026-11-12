import { AlertTriangle, Anchor, Crosshair, MoveRight } from 'lucide-react';
import type React from 'react';
import { CollapsibleSection } from '../CollapsibleSection';

export const MapLegendSection: React.FC = () => {
  return (
    <CollapsibleSection
      title="TACTICAL MAP LEGEND"
      collapsible={true}
      defaultOpen={true}
    >
      <div className="tools-legend-grid">
        <div className="legend-item" title="Army or Fleet movement arrow">
          <span className="legend-swatch swatch-move">
            <MoveRight size={12} />
          </span>
          <span className="legend-label">Move / Attack</span>
        </div>
        <div className="legend-item" title="Fleet convoying an army across sea">
          <span className="legend-swatch swatch-convoy">
            <Anchor size={12} />
          </span>
          <span className="legend-label">Fleet Convoy</span>
        </div>
        <div className="legend-item" title="Support order to hold or move">
          <span className="legend-swatch swatch-support">
            <Crosshair size={12} />
          </span>
          <span className="legend-label">Support Link</span>
        </div>
        <div className="legend-item" title="Tactical issue or warning">
          <span className="legend-swatch swatch-warn">
            <AlertTriangle size={12} />
          </span>
          <span className="legend-label">Warning</span>
        </div>
      </div>
    </CollapsibleSection>
  );
};
