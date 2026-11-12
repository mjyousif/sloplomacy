import { Shield, ShieldAlert, Sliders } from 'lucide-react';
import type React from 'react';
import { CollapsibleSection } from '../CollapsibleSection';
import type { ToolsSidebarProps } from './toolsSidebarProps';

export type AdminSectionProps = Required<
  Pick<ToolsSidebarProps, 'onOpenAdminTools'>
> &
  Pick<ToolsSidebarProps, 'adminOverrideActive' | 'onToggleAdminOverride'>;

export const AdminSection: React.FC<AdminSectionProps> = ({
  onOpenAdminTools,
  adminOverrideActive = false,
  onToggleAdminOverride,
}) => {
  return (
    <CollapsibleSection
      title="CREATOR ADMIN TOOLS"
      icon={<ShieldAlert size={12} />}
      collapsible={true}
      defaultOpen={true}
      className="admin-tools-section"
    >
      <p className="tools-micro-desc">
        Roll back turns, teleport units, spawn or destroy forces arbitrarily.
      </p>
      <div className="admin-actions-column">
        <button
          type="button"
          data-testid="btn-open-admin-console"
          className="tools-btn tools-admin-console-btn"
          onClick={onOpenAdminTools}
          title="Open comprehensive administrator modal"
        >
          <Sliders size={13} />
          <span>Open Admin Console</span>
        </button>
        {onToggleAdminOverride && (
          <button
            type="button"
            className={`tools-btn admin-override-toggle-btn ${adminOverrideActive ? 'active' : ''}`}
            onClick={onToggleAdminOverride}
            title="Toggle Direct-Edit Override on the board"
          >
            <Shield size={13} />
            <span>
              {adminOverrideActive ? 'Direct-Edit: ON' : 'Direct-Edit: OFF'}
            </span>
          </button>
        )}
      </div>
    </CollapsibleSection>
  );
};
