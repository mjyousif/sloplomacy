import type React from 'react';
import { POWER_METADATA, type Power } from '../types/diplomacy';

export interface PowerFlagProps extends React.SVGProps<SVGSVGElement> {
  power: Power;
  width?: number | string;
  height?: number | string;
  className?: string;
  title?: string;
}

/**
 * Historical World War I (1901-1918) flags for the 7 Great Powers in Sloplomacy.
 * - Austria-Hungary: Austro-Hungarian dual civil ensign with Austrian & Hungarian arms
 * - England: British Union Flag (Union Jack)
 * - France: French Republic Tricolour
 * - Germany: German Empire (Schwarz-Weiß-Rot) horizontal tricolour
 * - Italy: Kingdom of Italy tricolour with the House of Savoy crowned arms
 * - Russia: Russian Empire tricolour with the 1914-1917 Imperial Eagle canton
 * - Turkey: Ottoman Empire flag with white crescent and five-pointed star
 */
export const PowerFlag: React.FC<PowerFlagProps> = ({
  power,
  width = 22,
  height = 15,
  className = '',
  title,
  style,
  ...rest
}) => {
  const meta = POWER_METADATA[power];
  const flagTitle = title || `Flag of ${meta?.name || power}`;

  const renderFlagContent = () => {
    switch (power) {
      case 'AUSTRIA':
        return (
          <>
            {/* Top red bar */}
            <rect width="60" height="13.333" fill="#C8102E" />
            {/* Middle white bar */}
            <rect y="13.333" width="60" height="13.334" fill="#FFFFFF" />
            {/* Bottom bar: left Austrian red, right Hungarian green */}
            <rect y="26.667" width="30" height="13.333" fill="#C8102E" />
            <rect x="30" y="26.667" width="30" height="13.333" fill="#008C45" />

            {/* Austrian Coat of Arms (Hoist / Left) */}
            <path
              d="M15,15.5 c0,-2.2 1.5,-2.8 3,-2.8 c1.5,0 3,0.6 3,2.8 z"
              fill="#FFD700"
              stroke="#B8860B"
              strokeWidth="0.4"
            />
            <circle cx="18" cy="12.3" r="0.5" fill="#FFD700" />
            <path
              d="M14,16 h8 v4.5 c0,2.5 -4,4 -4,4 c0,0 -4,-1.5 -4,-4 z"
              fill="#C8102E"
              stroke="#8B0000"
              strokeWidth="0.3"
            />
            <rect x="14" y="18.2" width="8" height="2" fill="#FFFFFF" />

            {/* Hungarian Coat of Arms (Fly / Right) */}
            <path
              d="M39,15.5 c0,-2 1.5,-2.5 3,-2.5 c1.5,0 3,0.5 3,2.5 z"
              fill="#FFD700"
              stroke="#B8860B"
              strokeWidth="0.4"
            />
            <line
              x1="42"
              y1="12.8"
              x2="42.8"
              y2="11.4"
              stroke="#FFD700"
              strokeWidth="0.6"
              strokeLinecap="round"
            />
            <path
              d="M38,16 h8 v4.5 c0,2.5 -4,4 -4,4 c0,0 -4,-1.5 -4,-4 z"
              fill="#C8102E"
              stroke="#8B0000"
              strokeWidth="0.3"
            />
            <line
              x1="38"
              y1="17.2"
              x2="42"
              y2="17.2"
              stroke="#FFFFFF"
              strokeWidth="0.8"
            />
            <line
              x1="38"
              y1="19.2"
              x2="42"
              y2="19.2"
              stroke="#FFFFFF"
              strokeWidth="0.8"
            />
            <path d="M42,21 q1,-1 2,0 q1,-1 2,0 v3.5 h-4 z" fill="#008C45" />
            <line
              x1="44"
              y1="16.5"
              x2="44"
              y2="21"
              stroke="#FFFFFF"
              strokeWidth="0.6"
            />
            <line
              x1="43"
              y1="17.8"
              x2="45"
              y2="17.8"
              stroke="#FFFFFF"
              strokeWidth="0.6"
            />
          </>
        );

      case 'ENGLAND':
        return (
          <>
            {/* Field */}
            <rect width="60" height="40" fill="#012169" />
            {/* St Andrew Saltire (White) */}
            <path
              d="M0,0 L60,40 M60,0 L0,40"
              stroke="#FFFFFF"
              strokeWidth="8"
            />
            {/* St Patrick Saltire (Red, counterchanged with 180deg rotational symmetry) */}
            <polygon points="0,0 0,3.5 24.5,20 30,20" fill="#C8102E" />
            <polygon points="0,40 3.5,40 25.5,25 22,23 0,38" fill="#C8102E" />
            <g transform="rotate(180 30 20)">
              <polygon points="0,0 0,3.5 24.5,20 30,20" fill="#C8102E" />
              <polygon points="0,40 3.5,40 25.5,25 22,23 0,38" fill="#C8102E" />
            </g>
            {/* St George Cross Fimbriation (White) */}
            <path d="M24,0 H36 V40 H24 Z M0,14 H60 V26 H0 Z" fill="#FFFFFF" />
            {/* St George Cross (Red) */}
            <path d="M26,0 H34 V40 H26 Z M0,16 H60 V24 H0 Z" fill="#C8102E" />
          </>
        );

      case 'FRANCE':
        return (
          <>
            <rect x="0" width="20" height="40" fill="#002654" />
            <rect x="20" width="20" height="40" fill="#FFFFFF" />
            <rect x="40" width="20" height="40" fill="#ED2939" />
          </>
        );

      case 'GERMANY':
        return (
          <>
            <rect y="0" width="60" height="13.333" fill="#181818" />
            <rect y="13.333" width="60" height="13.334" fill="#FFFFFF" />
            <rect y="26.667" width="60" height="13.333" fill="#BA1020" />
          </>
        );

      case 'ITALY':
        return (
          <>
            <rect x="0" width="20" height="40" fill="#008C45" />
            <rect x="20" width="20" height="40" fill="#FFFFFF" />
            <rect x="40" width="20" height="40" fill="#CD212A" />

            {/* Savoy Arms on the white stripe */}
            <path
              d="M24,14 h12 v7.5 c0,4.5 -6,7.5 -6,7.5 c0,0 -6,-3 -6,-7.5 z"
              fill="#002B7F"
            />
            <path
              d="M25,15 h10 v6.5 c0,3.8 -5,6.3 -5,6.3 c0,0 -5,-2.5 -5,-6.3 z"
              fill="#CD212A"
            />
            <rect x="29" y="15" width="2" height="12.5" fill="#FFFFFF" />
            <rect x="25" y="19" width="10" height="2" fill="#FFFFFF" />

            {/* Royal Crown */}
            <path
              d="M25,13.2 l1,-3.2 l2.5,1.5 l1.5,-2.5 l1.5,2.5 l2.5,-1.5 l1,3.2 z"
              fill="#FFD700"
              stroke="#B8860B"
              strokeWidth="0.5"
              strokeLinejoin="round"
            />
            <circle cx="30" cy="8.8" r="0.6" fill="#FFFFFF" />
            <circle cx="26" cy="9.8" r="0.4" fill="#FFFFFF" />
            <circle cx="34" cy="9.8" r="0.4" fill="#FFFFFF" />
          </>
        );

      case 'RUSSIA':
        return (
          <>
            <rect y="0" width="60" height="13.333" fill="#FFFFFF" />
            <rect y="13.333" width="60" height="13.334" fill="#0039A6" />
            <rect y="26.667" width="60" height="13.333" fill="#D52B1E" />

            {/* 1914-1917 Imperial Eagle Canton */}
            <rect
              x="0"
              y="0"
              width="22"
              height="18"
              fill="#FDB813"
              stroke="#D49A09"
              strokeWidth="0.4"
            />
            <g transform="translate(11, 9) scale(0.7)">
              <path
                d="M-1.2,-3.5 C-1.5,-5 -3,-5 -3.5,-4.2 C-4,-3.5 -3.2,-2.5 -4.5,-3 C-6.5,-3.8 -7.5,-1.8 -6.5,-0.2 C-7.5,1.5 -6.2,3 -5,3.2 C-4,4.5 -2.5,4 -2,4.8 L-1,6.5 L0,5.8 L1,6.5 L2,4.8 C2.5,4 4,4.5 5,3.2 C6.2,3 7.5,1.5 6.5,-0.2 C7.5,-1.8 6.5,-3.8 4.5,-3 C3.2,-2.5 4,-3.5 3.5,-4.2 C3,-5 1.5,-5 1.2,-3.5 Z"
                fill="#181818"
              />
              <path d="M-2,5 L0,7.2 L2,5 L1.2,8 L-1.2,8 Z" fill="#181818" />
              <circle cx="-2.5" cy="-5.2" r="0.7" fill="#FFD700" />
              <circle cx="2.5" cy="-5.2" r="0.7" fill="#FFD700" />
              <path
                d="M-1.8,-6.5 h3.6 l-0.6,-1.5 l-1.2,0.8 l-1.2,-0.8 z"
                fill="#FFD700"
              />
              <rect
                x="-1.5"
                y="-1.5"
                width="3"
                height="3.5"
                rx="0.5"
                fill="#D52B1E"
              />
            </g>
          </>
        );

      case 'TURKEY':
        return (
          <>
            <rect width="60" height="40" fill="#BA1020" />
            {/* White crescent outer circle */}
            <circle cx="23" cy="20" r="9" fill="#FFFFFF" />
            {/* Red crescent inner cutout */}
            <circle cx="25.8" cy="20" r="7.2" fill="#BA1020" />
            {/* White five-pointed star */}
            <polygon
              points="34.5,20 32.1,20.9 32.2,23.5 30.5,21.6 28.0,22.2 29.3,20 28.0,17.8 30.5,18.4 32.2,16.5 32.1,19.1"
              fill="#FFFFFF"
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <svg
      viewBox="0 0 60 40"
      width={width}
      height={height}
      role="img"
      aria-label={flagTitle}
      data-testid={`power-flag-${power.toLowerCase()}`}
      className={`power-flag power-flag-${power.toLowerCase()} ${className}`.trim()}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        borderRadius: 2,
        overflow: 'hidden',
        boxShadow:
          '0 0 0 1px rgba(0, 0, 0, 0.35), 0 1px 2px rgba(0, 0, 0, 0.25)',
        flexShrink: 0,
        ...style,
      }}
      {...rest}
    >
      <title>{flagTitle}</title>
      {renderFlagContent()}
    </svg>
  );
};
