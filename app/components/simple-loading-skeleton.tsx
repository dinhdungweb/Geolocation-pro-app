type SimpleLoadingSkeletonProps = {
  label?: string;
  minHeight?: number;
  rows?: number;
};

export function SimpleLoadingSkeleton({
  label = "Loading data",
  minHeight = 240,
  rows = 4,
}: SimpleLoadingSkeletonProps) {
  return (
    <div
      className="geo-simple-skeleton"
      aria-busy="true"
      aria-label={label}
      role="status"
      style={{ minHeight }}
    >
      <div className="geo-simple-skeleton-content" aria-hidden="true">
        <span className="geo-simple-skeleton-line geo-simple-skeleton-heading" />
        <span className="geo-simple-skeleton-block" />
        <div className="geo-simple-skeleton-rows">
          {Array.from({ length: rows }).map((_, index) => (
            <span
              className="geo-simple-skeleton-line"
              key={index}
              style={{ width: `${92 - (index % 3) * 11}%` }}
            />
          ))}
        </div>
      </div>
      <style>
        {`
          .geo-simple-skeleton {
            display: grid;
            width: 100%;
            align-items: start;
            padding: var(--p-space-400, 16px);
            box-sizing: border-box;
          }
          .geo-simple-skeleton-content {
            display: grid;
            width: 100%;
            gap: var(--p-space-300, 12px);
          }
          .geo-simple-skeleton-line,
          .geo-simple-skeleton-block {
            position: relative;
            display: block;
            overflow: hidden;
            border-radius: var(--p-border-radius-200, 8px);
            background: var(--p-color-bg-surface-secondary, #f3f3f3);
          }
          .geo-simple-skeleton-line::after,
          .geo-simple-skeleton-block::after {
            position: absolute;
            inset: 0;
            content: "";
            background: linear-gradient(
              90deg,
              transparent,
              rgb(255 255 255 / 72%),
              transparent
            );
            transform: translateX(-100%);
            animation: geo-simple-skeleton-shimmer 1.3s ease-in-out infinite;
          }
          .geo-simple-skeleton-line {
            height: 10px;
          }
          .geo-simple-skeleton-heading {
            width: min(180px, 38%);
            height: 14px;
          }
          .geo-simple-skeleton-block {
            min-height: 112px;
          }
          .geo-simple-skeleton-rows {
            display: grid;
            gap: var(--p-space-200, 8px);
          }
          @keyframes geo-simple-skeleton-shimmer {
            to {
              transform: translateX(100%);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .geo-simple-skeleton-line::after,
            .geo-simple-skeleton-block::after {
              animation: none;
            }
          }
        `}
      </style>
    </div>
  );
}
