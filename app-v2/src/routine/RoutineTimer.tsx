// A focused countdown for the activities that have one (the plank, the
// strength session).
//
// It lives in an overlay rather than inside the tile on purpose: the tile is
// the completion control, and a second interactive thing inside it would make
// a tap ambiguous about what it does. Running the clock to zero completes the
// activity; stopping early leaves it alone.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoutineActivity } from './model';
import { IconPlay, IconPause, IconReset, IconX, IconCheck } from '../ui/icons';

function format(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface Props {
  activity: RoutineActivity;
  done: boolean;
  onComplete: () => void;
  onClose: () => void;
}

export function RoutineTimer({ activity, done, onComplete, onClose }: Props) {
  const total = activity.timerSec || 60;
  const [remaining, setRemaining] = useState(total);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const completeRef = useRef(onComplete);
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);

  const doneRef = useRef(done);
  useEffect(() => { doneRef.current = done; }, [done]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemaining(prev => {
        if (prev > 1) return prev - 1;
        window.clearInterval(id);
        setRunning(false);
        setFinished(true);
        // Reaching zero is an unambiguous "I did it" — mark it, unless the
        // user already had.
        if (!doneRef.current) completeRef.current();
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const reset = useCallback(() => { setRunning(false); setFinished(false); setRemaining(total); }, [total]);

  // Escape closes, space toggles — keyboard parity for desktop use.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); setRunning(r => !r); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pct = total === 0 ? 0 : (total - remaining) / total;
  const R = 86;
  const C = 2 * Math.PI * R;

  return (
    <div
      className="ds-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={`${activity.title} timer`}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rt-timer">
        <div className="rt-timer-head">
          <span className="rt-timer-name">{activity.title}</span>
          <button className="ds-icon-btn" onClick={onClose} aria-label="Close timer"><IconX /></button>
        </div>

        <div className={`rt-timer-dial${finished ? ' is-finished' : ''}`}>
          <svg viewBox="0 0 200 200" aria-hidden>
            <circle className="track" cx="100" cy="100" r={R} fill="none" strokeWidth="10" />
            <circle
              className="fill"
              cx="100" cy="100" r={R}
              fill="none"
              strokeWidth="10"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
            />
          </svg>
          <div className="rt-timer-read" role="timer" aria-live="off">
            {finished ? <IconCheck /> : format(remaining)}
          </div>
        </div>

        <div className="rt-timer-actions">
          <button className="ds-icon-btn" onClick={reset} aria-label="Reset timer"><IconReset /></button>
          <button
            className="ds-btn ds-btn--primary"
            onClick={() => { if (finished) { reset(); return; } setRunning(r => !r); }}
          >
            {finished ? <><IconReset style={{ width: 18, height: 18 }} />Again</>
              : running ? <><IconPause style={{ width: 18, height: 18 }} />Pause</>
              : <><IconPlay style={{ width: 18, height: 18 }} />Start</>}
          </button>
          <button className="ds-btn ds-btn--quiet" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
