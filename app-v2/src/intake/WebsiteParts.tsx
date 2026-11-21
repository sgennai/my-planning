// Intake › Websites: the pieces the library is drawn with, after the approved Focus Desk Light prototype
// (websites-focus-desk-light.html): a site's card art (its two colours and a pattern), its logo (`SiteLogo`, one
// component for every view), the pinned tile, the list row and the bento card.
//
// A row, a card and a pinned tile open the website itself: each is a link (new tab, noopener noreferrer). A row's or
// card's pin and its More button (the details) sit beside the link, never inside it, so a tap on them never opens
// the site, and the keyboard reaches each on its own.
import { useId, type CSSProperties, type ReactNode } from 'react';
import { artOf, domainOf, initialsOf, safeLogoImage, type LogoImage, type Pattern, type Website } from './websites';

// ── Icons, as the prototype draws them (24px grid, 1.7 stroke) ─────────────
const Svg = ({ children, className = 'ws-ic' }: { children: ReactNode; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{children}</svg>
);
export const IcStar = () => <Svg><path d="m12 2 3.1 6.3 7 .9-5.1 5 .9 7-5.9-3.3-5.9 3.3.9-7-5.1-5 7-.9z" /></Svg>;
export const IcOpen = () => <Svg><path d="M13 5h6v6m0-6-9 9" /><path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" /></Svg>;
export const IcArrow = () => <Svg><path d="M5 12h14m-5-5 5 5-5 5" /></Svg>;
export const IcPlus = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
export const IcSearch = () => <Svg><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></Svg>;
export const IcGrid = () => <Svg><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Svg>;
export const IcList = () => <Svg><path d="M9 6h12M9 12h12M9 18h12" /><path d="M3 6h2m-2 6h2m-2 6h2" /></Svg>;
export const IcClose = () => <Svg><path d="M5 5 19 19M19 5 5 19" /></Svg>;
export const IcEdit = () => <Svg><path d="m4 20 4-.8L19 8l-3-3L5 16zM14 7l3 3" /></Svg>;
export const IcTrash = () => <Svg><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6" /></Svg>;
export const IcUp = () => <Svg><path d="M12 19V5m-6 6 6-6 6 6" /></Svg>;
export const IcDown = () => <Svg><path d="M12 5v14m-6-6 6 6 6-6" /></Svg>;
export const IcCheck = () => <Svg><path d="m4 12 5 5L20 6" /></Svg>;
export const IcMore = () => <Svg><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></Svg>;
export const IcSort = () => <Svg><path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" /></Svg>;

// ── Card art: the prototype's gradient and patterns, in the website's colours ──
function pattern(p: Pattern): ReactNode {
  switch (p) {
    case 'orb': return <><circle cx="680" cy="140" r="230" fill="none" stroke="white" strokeOpacity=".32" strokeWidth="1.5" /><circle cx="680" cy="140" r="183" fill="white" fillOpacity=".08" /><circle cx="680" cy="140" r="137" fill="white" fillOpacity=".12" /><circle cx="680" cy="140" r="85" fill="white" fillOpacity=".14" /><path d="M0 280 C300 160 440 380 850 230" fill="none" stroke="white" strokeOpacity=".22" strokeWidth="3" /></>;
    case 'rings': return <>{Array.from({ length: 7 }, (_, i) => <circle key={i} cx="650" cy="170" r={55 + i * 38} stroke="white" fill="none" strokeWidth={i % 2 ? 2 : 1} opacity={0.36 - i * 0.023} />)}<path d="M0 260Q400 80 900 255" fill="none" stroke="#ffffff" opacity=".3" /></>;
    case 'wave': return <>{Array.from({ length: 8 }, (_, i) => <path key={i} d={`M-50 ${130 + i * 28} C200 ${-30 + i * 35} 450 ${360 + i * 12} 900 ${90 + i * 20}`} fill="none" stroke="white" strokeOpacity=".18" strokeWidth="2" />)}</>;
    case 'arc': return <><circle cx="695" cy="330" r="300" fill="white" fillOpacity=".08" /><path d="M350 360 A350 350 0 0 1 900 60" stroke="white" strokeWidth="50" opacity=".18" fill="none" /><path d="M470 360 A235 235 0 0 1 870 130" stroke="white" strokeWidth="13" opacity=".4" fill="none" /></>;
    case 'grid': return <>{Array.from({ length: 14 }, (_, i) => <path key={i} d={`M${i * 70} 0V370M0 ${i * 48}H900`} stroke="white" opacity=".08" />)}<rect x="590" y="63" width="180" height="180" rx="16" fill="white" fillOpacity=".15" transform="rotate(-18 680 153)" /></>;
    case 'lines': return <>{Array.from({ length: 12 }, (_, i) => <path key={i} d={`M350 ${i * 36} 900 ${i * 36 - 140}`} stroke="white" opacity=".17" strokeWidth="2" />)}<circle cx="710" cy="140" r="100" stroke="white" opacity=".22" strokeWidth="1" fill="none" /></>;
    default: return <g stroke="white" strokeOpacity=".24" fill="none">{Array.from({ length: 19 }, (_, i) => { const x = 380 + (i * 71) % 510, y = (i * 83) % 310; return <g key={i}><circle cx={x} cy={y} r={(i % 3) + 4} fill="white" fillOpacity=".32" /><path d={`M${x} ${y}L${380 + ((i + 3) * 71) % 510} ${((i + 3) * 83) % 310}`} /></g>; })}</g>;
  }
}

export function SiteArt({ site, children, className = '' }: { site: Website; children?: ReactNode; className?: string }) {
  const id = useId().replace(/:/g, '');
  const { c1, c2, pattern: p } = artOf(site);
  return (
    <div className={`ws-art ${className}`} style={{ '--art1': c1, '--art2': c2 } as CSSProperties}>
      <svg viewBox="0 0 900 370" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="1" x2="1" y2="0"><stop stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient>
          <radialGradient id={`r${id}`}><stop stopColor="white" stopOpacity=".22" /><stop offset="1" stopColor="white" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width="900" height="370" fill={`url(#g${id})`} />
        <ellipse cx="690" cy="70" rx="400" ry="310" fill={`url(#r${id})`} />
        {pattern(p)}
      </svg>
      {children}
    </div>
  );
}

// ── The logo: one component, every view ───────────────────────────────────
// `square`: a fixed square frame (lists, the sheets' rows). `plate`: a fixed height, as wide as the logo needs up to
// a limit (cards and tiles): a wordmark where the site names one, else its square icon. Neither ever stretches or
// crops a logo: it is contained, centred, on a plate that keeps it readable (light, or dark for a light logo); an
// app icon opaque to its edges fills its frame instead. With no logo, the website's initials in its colours, in the
// same frame. The pictures are the device's own PNGs, kept in the record: they are there at once, and no image
// ever loads late or breaks. What a record holds is checked before it is shown (`safeLogoImage`): only a PNG data
// address of the size the device makes; anything else, from a damaged or foreign record, gives the initials.

function Img({ img }: { img: LogoImage }) {
  return <img className="ws-logo-img" src={img.data} width={img.w} height={img.h} alt="" draggable={false} decoding="async" />;
}

export function SiteLogo({ site, shape }: { site: Website; shape: 'square' | 'plate' }) {
  const square = safeLogoImage(site.logo?.square, 'square');
  const wide = safeLogoImage(site.logo?.wide, 'wide');
  if (shape === 'plate' && wide) {
    return <span className={`ws-logo is-plate is-wide plate-${wide.plate}`} style={{ '--ws-r': wide.w / wide.h } as CSSProperties} aria-hidden="true"><Img img={wide} /></span>;
  }
  const img = square ?? (shape === 'square' ? wide : null);
  if (img) {
    return (
      <span className={`ws-logo is-${shape === 'plate' ? 'plate' : 'square'}${img.bleed ? ' is-bleed' : ` plate-${img.plate}`}${img === wide ? ' is-wide' : ''}`} aria-hidden="true">
        <Img img={img} />
      </span>
    );
  }
  const { c1, c2 } = artOf(site);
  return (
    <span className={`ws-logo is-${shape === 'plate' ? 'plate' : 'square'} is-monogram`} style={{ '--art1': c1, '--art2': c2 } as CSSProperties} aria-hidden="true">
      {initialsOf(site.name)}
    </span>
  );
}

// ── Pinned & ready ─────────────────────────────────────────────────────────

export function PinnedTile({ site }: { site: Website }) {
  return (
    <a className="ws-tile" href={site.url} target="_blank" rel="noopener noreferrer">
      <SiteArt site={site} className="is-tile" />
      <span className="ws-tile-logo"><SiteLogo site={site} shape="plate" /></span>
      <span className="ws-tile-top" aria-hidden="true">★ Pinned</span>
      <span className="ws-tile-bottom">
        <span className="ws-tile-copy"><strong>{site.name}</strong><small>{domainOf(site.url)}</small><span className="ik-vh">, opens the website</span></span>
        <IcOpen />
      </span>
    </a>
  );
}

// ── The collections ────────────────────────────────────────────────────────

interface ItemProps { site: Website; onDetails: (id: string) => void; onPin: (site: Website) => void }

/** Pin, and the details: controls of their own, beside the link to the site. */
function PinButton({ site, onPin, className = '' }: { site: Website; onPin: (s: Website) => void; className?: string }) {
  return (
    <button
      type="button"
      className={`ws-pin ${className}${site.pinned ? ' is-on' : ''}`}
      aria-pressed={site.pinned}
      aria-label={site.pinned ? `Unpin ${site.name}` : `Pin ${site.name}`}
      title={site.pinned ? 'Unpin' : 'Pin to Pinned & ready'}
      onClick={() => onPin(site)}
    ><IcStar /></button>
  );
}
function MoreButton({ site, onDetails, className = '' }: { site: Website; onDetails: (id: string) => void; className?: string }) {
  return (
    <button type="button" className={`ws-more-btn ${className}`} aria-label={`Details for ${site.name}`} title="Details" onClick={() => onDetails(site.id)}>
      <IcMore />
    </button>
  );
}

export function ListRow({ site, onDetails, onPin }: ItemProps) {
  return (
    <div className="ws-row ws-site" data-site={site.id}>
      <a className="ws-row-link" href={site.url} target="_blank" rel="noopener noreferrer">
        <SiteLogo site={site} shape="square" />
        <span className="ws-row-copy">
          <strong className="ws-name"><span className="ws-name-text">{site.name}</span></strong>
          <small className="ws-row-domain">{domainOf(site.url)}</small>
          {site.description && <small className="ws-row-desc">{site.description}</small>}
          <span className="ik-vh">, opens the website</span>
        </span>
      </a>
      <PinButton site={site} onPin={onPin} />
      <MoreButton site={site} onDetails={onDetails} />
    </div>
  );
}

export function BentoCard({ site, onDetails, onPin }: ItemProps) {
  return (
    <div className="ws-card ws-site" data-site={site.id}>
      <a className="ws-card-link" href={site.url} target="_blank" rel="noopener noreferrer">
        <SiteArt site={site} className="is-card">
          <span className="ws-card-logo"><SiteLogo site={site} shape="plate" /></span>
          <span className="ws-art-title" aria-hidden="true">{site.name}</span>
        </SiteArt>
        <span className="ws-card-body">
          <span className="ws-card-head">
            <strong className="ws-name"><span className="ws-name-text">{site.name}</span></strong>
            <IcOpen />
          </span>
          <span className={`ws-card-desc${site.description ? '' : ' is-none'}`}>{site.description || 'No description yet.'}</span>
          <span className="ws-card-domain">{domainOf(site.url)}</span>
          <span className="ik-vh">, opens the website</span>
        </span>
      </a>
      <PinButton site={site} onPin={onPin} className="is-floating" />
      <MoreButton site={site} onDetails={onDetails} className="is-corner" />
    </div>
  );
}
