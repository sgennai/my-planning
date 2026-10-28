// The set counter on a Routine tile.

/**
 * One arc per set around the status mark, lit as each set is logged. Shared
 * with the settings preview, so the editor shows what the tile will.
 */
export function SetRing({ sets, done }: { sets: number; done: number }) {
  const R = 17, C = 2 * Math.PI * R, Q = C / sets, GAP = 5;
  return (
    <span className="cin-sets" aria-hidden>
      <svg viewBox="0 0 40 40">
        {Array.from({ length: sets }, (_, i) => (
          <circle
            key={i}
            className={i < done ? 'on' : undefined}
            cx="20" cy="20" r={R}
            strokeDasharray={`${Q - GAP} ${C - Q + GAP}`}
            strokeDashoffset={-(i * Q) - GAP / 2}
          />
        ))}
      </svg>
    </span>
  );
}
