import React, { useState } from 'react';
import { GitCommit, Check, ExternalLink } from 'lucide-react';

interface VersionBadgeProps {
  className?: string;
  showExternalLink?: boolean;
}

export const VersionBadge: React.FC<VersionBadgeProps> = ({
  className = '',
  showExternalLink = true,
}) => {
  const [copied, setCopied] = useState(false);
  const commit =
    typeof __COMMIT_HASH__ !== 'undefined' && __COMMIT_HASH__
      ? __COMMIT_HASH__
      : 'dev';
  const isKnownCommit = commit !== 'dev' && commit.length >= 4;
  const commitUrl = isKnownCommit
    ? `https://github.com/mjyousif/sloplomacy/commit/${commit}`
    : undefined;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(commit);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`version-badge-container ${className}`}
      title={`Build revision: ${commit}`}
    >
      <button
        type="button"
        className="version-badge-copy-btn"
        onClick={handleCopy}
        aria-label={`Copy revision hash ${commit}`}
        title="Click to copy commit hash"
      >
        {copied ? (
          <Check size={11} className="version-badge-check-icon" />
        ) : (
          <GitCommit size={11} className="version-badge-commit-icon" />
        )}
        <span className="version-badge-text">
          {copied ? 'copied' : `rev ${commit}`}
        </span>
      </button>

      {showExternalLink && commitUrl && (
        <a
          href={commitUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="version-badge-link"
          title={`View commit ${commit} on GitHub`}
          aria-label="View commit on GitHub"
        >
          <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
};
