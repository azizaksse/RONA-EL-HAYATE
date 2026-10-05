/* Line icons and brand art shared by the store and the admin panel. Path data is static, so it is injected as markup. */
const IC = {
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>',
  truck: '<path d="M3 6h11v10H3zM14 9.5h4l3 3.5V16h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
  phone: '<path d="M5 4h4l1.5 4.5-2.5 1.5a11 11 0 0 0 6 6l1.5-2.5L20 15v4a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>',
  box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chat: '<path d="M4 20l1.5-4A8 8 0 1 1 9 19.2z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  cart: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  team: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/>',
};
export type IconName = keyof typeof IC;

export function Icon({ n, s = 22, className }: { n: IconName; s?: number; className?: string }) {
  return <svg className={className} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: IC[n] }} />;
}

export function Logo({ s }: { s: number }) {
  // logo.png is a wide landscape image (~2.5:1 ratio)
  return <img src="/logo.png" alt="رونق الحياة" height={s} width={Math.round(s * 2.5)} style={{ objectFit: 'contain', display: 'block' }} />;
}

export function Sparkle({ l, t, s, c, cls = "" }: { l: string; t: string; s: number; c: string; cls?: string }) {
  return (
    <svg className={"twinkle " + cls} style={{ left: l, top: t }} width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1c.8 5.6 5.4 10.2 11 11-5.6.8-10.2 5.4-11 11-.8-5.6-5.4-10.2-11-11C6.6 11.2 11.2 6.6 12 1z" fill={c} />
    </svg>
  );
}

export function Pattern() {
  return (
    <svg className="pat" aria-hidden="true">
      <defs>
        <pattern id="zl" width="48" height="48" patternUnits="userSpaceOnUse">
          <rect x="14" y="14" width="20" height="20" fill="none" stroke="#D4A613" strokeOpacity=".15" />
          <rect x="14" y="14" width="20" height="20" fill="none" stroke="#D4A613" strokeOpacity=".15" transform="rotate(45 24 24)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#zl)" />
    </svg>
  );
}

export function Spinner() {
  return <svg className="spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 1-9 9" /></svg>;
}
