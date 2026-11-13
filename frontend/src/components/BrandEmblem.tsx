import { Compass } from 'lucide-react';
import type React from 'react';
import { cx } from '../utils/cx';
import styles from './BrandEmblem.module.css';

interface BrandEmblemProps {
  /** Extra class for the caller's own sizing, such as the phone top bar's smaller badge. */
  className?: string;
  /** Size of the compass icon, in pixels. */
  iconSize?: number;
  /** The tag to render. A `span` where the badge sits inside inline text. */
  as?: 'div' | 'span';
}

/** The gold compass badge on the top bar and the phone top bar's brand. */
export const BrandEmblem: React.FC<BrandEmblemProps> = ({
  className,
  iconSize = 22,
  as: Tag = 'div',
}) => (
  <Tag className={cx(styles.brandEmblem, className)}>
    <Compass size={iconSize} />
  </Tag>
);
