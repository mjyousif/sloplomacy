import { Check, ExternalLink, GitCommit } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { copyText } from '../../utils/clipboard';
import { cx } from '../../utils/cx';
import styles from './VersionBadge.module.css';

interface VersionBadgeProps {
  className?: string;
  showExternalLink?: boolean;
}

export const VersionBadge: React.FC<VersionBadgeProps> = ({
  className = '',
  showExternalLink = true,
}) => {
  const [copyState, setCopyState] = useState<'copied' | 'failed' | null>(null);
  const copied = copyState === 'copied';
  const commit =
    typeof __COMMIT_HASH__ !== 'undefined' && __COMMIT_HASH__
      ? __COMMIT_HASH__
      : 'dev';
  const isKnownCommit = commit !== 'dev' && commit.length >= 4;
  const commitUrl = isKnownCommit
    ? `https://github.com/mjyousif/sloplomacy/commit/${commit}`
    : undefined;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyText(commit);
    setCopyState(ok ? 'copied' : 'failed');
    setTimeout(() => setCopyState(null), 2000);
  };

  return (
    <div
      className={cx(styles.versionBadgeContainer, className)}
      title={`Build revision: ${commit}`}
    >
      <button
        type="button"
        className={styles.versionBadgeCopyBtn}
        onClick={handleCopy}
        aria-label={`Copy revision hash ${commit}`}
        title="Click to copy commit hash"
      >
        {copied ? (
          <Check size={11} className={styles.versionBadgeCheckIcon} />
        ) : (
          <GitCommit size={11} className={styles.versionBadgeCommitIcon} />
        )}
        <span className={styles.versionBadgeText}>
          {copied
            ? 'copied'
            : copyState === 'failed'
              ? 'copy failed'
              : `rev ${commit}`}
        </span>
      </button>

      {showExternalLink && commitUrl && (
        <a
          href={commitUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.versionBadgeLink}
          title={`View commit ${commit} on GitHub`}
          aria-label="View commit on GitHub"
        >
          <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
};
