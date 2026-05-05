import type { CSSProperties } from "react";

const PULSE_KEYFRAMES = `
@keyframes moveiq-skeleton-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
`;

const card: CSSProperties = {
  height: 80,
  background: "var(--bg-card, #1f2937)",
  border: "1px solid var(--border-soft, rgba(255,255,255,0.06))",
  borderRadius: 12,
  marginBottom: "var(--space-3, 12px)",
  animation: "moveiq-skeleton-pulse 1.5s ease-in-out infinite",
};

interface SkeletonListProps {
  /** Number of skeleton cards to render. Defaults to 3. */
  count?: number;
  /** Optional aria-label for screen readers. Defaults to "Loading…". */
  label?: string;
}

export function SkeletonList({ count = 3, label = "Loading…" }: SkeletonListProps) {
  return (
    <div role="status" aria-label={label} aria-busy="true" style={{ padding: "var(--space-3, 12px) 0" }}>
      <style>{PULSE_KEYFRAMES}</style>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            ...card,
            animationDelay: `${i * 120}ms`,
          }}
        />
      ))}
      <span style={{ position: "absolute", left: -10000, top: "auto", width: 1, height: 1, overflow: "hidden" }}>{label}</span>
    </div>
  );
}
