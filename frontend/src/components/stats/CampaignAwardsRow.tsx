import {
  Anchor,
  Award,
  Crown,
  Flame,
  Hammer,
  MessageSquare,
  Swords,
  TrendingUp,
} from 'lucide-react';
import type React from 'react';
import { type CampaignAward, POWER_METADATA } from '../../types/diplomacy';
import { PowerFlag } from '../ui/PowerFlag';
import styles from './CampaignStats.module.css';

export interface CampaignAwardsRowProps {
  awards: CampaignAward[];
}

function AwardIcon({ id }: { id: string }) {
  switch (id) {
    case 'kingmaker':
      return <Crown size={13} aria-hidden="true" />;
    case 'iron_chancellor':
      return <Swords size={13} aria-hidden="true" />;
    case 'grand_admiral':
      return <Anchor size={13} aria-hidden="true" />;
    case 'attrition_magnet':
      return <Flame size={13} aria-hidden="true" />;
    case 'silver_tongue':
      return <MessageSquare size={13} aria-hidden="true" />;
    case 'expansionist':
      return <TrendingUp size={13} aria-hidden="true" />;
    case 'industrialist':
      return <Hammer size={13} aria-hidden="true" />;
    default:
      return <Award size={13} aria-hidden="true" />;
  }
}

export const CampaignAwardsRow: React.FC<CampaignAwardsRowProps> = ({
  awards,
}) => {
  if (awards.length === 0) return null;

  return (
    <div className={styles.awardsRow} data-testid="campaign-awards-row">
      {awards.map((award) => {
        const meta = POWER_METADATA[award.power];
        return (
          <div
            key={award.id}
            className={styles.awardCard}
            data-testid={`campaign-award-${award.id}`}
            style={{
              borderColor: meta.color,
            }}
          >
            <div className={styles.awardHeader}>
              <span className={styles.awardTitle}>
                <AwardIcon id={award.id} />
                <span>{award.title}</span>
              </span>
            </div>
            <div className={styles.awardPower}>
              <span className={styles.awardPowerIdentity}>
                <PowerFlag power={award.power} width={18} height={12} />
                <span>{meta.shortName}</span>
              </span>
              <span className={styles.awardValue}>{award.value}</span>
            </div>
            <div className={styles.awardSubtitle}>{award.subtitle}</div>
          </div>
        );
      })}
    </div>
  );
};
