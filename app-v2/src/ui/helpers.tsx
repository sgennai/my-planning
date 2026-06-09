import { parseColorVal } from '../storage/data';

export function pad(n: number) { return String(n).padStart(2, '0'); }

export function hexToRgba(hex: string, a: number) {
  if (!hex || !hex.startsWith('#')) return hex;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function colorValToBackground(val: any, fallbackHex?: string) {
  const { hex, opacity, striped } = parseColorVal(val);
  const base = hex || fallbackHex || '#888';
  const rgba = hexToRgba(base, opacity);
  if (striped) {
    return `repeating-linear-gradient(45deg, ${rgba} 0px, ${rgba} 11px, rgba(255,255,255,0.35) 11px, rgba(255,255,255,0.35) 17px)`;
  }
  return rgba;
}

export function ColorPickerExtended(props: { value: any, defaultHex?: string, onChange: (val: any) => void }) {
  const { value, defaultHex, onChange } = props;
  const parsed = parseColorVal(value || defaultHex);
  const currentHex = parsed.hex || defaultHex || '#888888';
  function emit(patch: any) {
    onChange(Object.assign({ hex: currentHex, opacity: parsed.opacity, striped: parsed.striped }, patch));
  }
  return (
    <span className="cpx">
      <input type="color" value={currentHex} className="cpx-swatch" title="Pick colour" onChange={(e) => emit({ hex: e.target.value })} />
      <span className="cpx-sep" />
      <span className="cpx-group">
        <span className="cpx-label">Opacity</span>
        <input type="range" min="0.1" max="1" step="0.05" value={parsed.opacity} className="cpx-slider" onChange={(e) => emit({ opacity: Number(e.target.value) })} />
        <span className="cpx-pct">{Math.round(parsed.opacity * 100)}%</span>
      </span>
      <button type="button" className={'cpx-stripe-btn' + (parsed.striped ? ' active' : '')} onClick={() => emit({ striped: !parsed.striped })} title="Toggle diagonal stripes">
        {parsed.striped ? 'On' : 'Off'}
      </button>
    </span>
  );
}

export function ViewSwitcher({ view, onSwitchView }: { view: string, onSwitchView: (v: string) => void }) {
  return (
    <div className="view-switcher">
      <button
        className={'view-switcher-btn' + (view === 'today' ? ' active' : '')}
        onClick={() => view !== 'today' && onSwitchView('today')}
      >Day</button>
      <button
        className={'view-switcher-btn' + (view === 'plan' ? ' active' : '')}
        onClick={() => view !== 'plan' && onSwitchView('plan')}
      >Week</button>
    </div>
  );
}

export function generateId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).substring(2, 15);
}
