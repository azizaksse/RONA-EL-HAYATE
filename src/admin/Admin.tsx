import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ConvexProvider, ConvexReactClient, useConvex, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CONVEX_URL, DEFAULT_LANG, type Lang } from "../lib/config";
import { fill, tx } from "../lib/format";
import { Icon, Logo, type IconName } from "../lib/icons";
import { lsGet, lsSet } from "../lib/storage";
import "../styles/admin.css";
import { Ctx, errMsg, ViewBoundary, type AdminCtx, type Geo, type Me } from "./core";
import { L } from "./i18n";
import { Abandoned, Dashboard, Orders } from "./orders";
import { Customers, Products, Stock } from "./catalog";
import { Delivery, Settings, Team } from "./settings";

const VIEWS: Record<string, (p: { extra: Record<string, string> | null }) => ReactNode> = {
  dash: Dashboard, orders: Orders, abandoned: Abandoned, customers: Customers, products: Products, stock: Stock, delivery: Delivery, team: Team, settings: Settings,
};
const TABS: [string, IconName, string][] = [["dash", "grid", "view"], ["orders", "list", "view"], ["abandoned", "cart", "view"], ["customers", "users", "view"], ["products", "tag", "catalog"], ["stock", "box", "view"], ["delivery", "truck", "view"], ["team", "team", "team"], ["settings", "gear", "view"]];

export default function Admin() {
  const [lang, setLang] = useState<Lang>(() => lsGet<Lang | null>("ronaq_admin_lang", null) || DEFAULT_LANG);
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"; }, [lang]);
  useEffect(() => {
    document.body.classList.add("admin"); document.title = "لوحة التحكم · رونق الحياة";
    const robots = document.createElement("meta"); robots.name = "robots"; robots.content = "noindex, nofollow"; document.head.appendChild(robots);
    return () => { document.body.classList.remove("admin"); robots.remove(); };
  }, []);
  const switchLang = useCallback(() => setLang((l) => { const n = l === "ar" ? "fr" : "ar"; lsSet("ronaq_admin_lang", n); return n; }), []);
  const client = useMemo(() => (CONVEX_URL ? new ConvexReactClient(CONVEX_URL) : null), []);
  const t = L[lang];

  if (!client) {
    return <div id="admin"><div className="login"><div className="panel" style={{ maxWidth: 520 }}>
      <h1 className="disp" style={{ margin: "0 0 10px", fontSize: 26 }}>{t.setupTitle}</h1>
      <p style={{ margin: 0, lineHeight: 1.8, color: "var(--soft)" }}>{t.setupText}</p>
    </div></div></div>;
  }
  return <ConvexProvider client={client}><div id="admin"><Session lang={lang} switchLang={switchLang} /></div></ConvexProvider>;
}

function Session({ lang, switchLang }: { lang: Lang; switchLang: () => void }) {
  const convex = useConvex();
  const [token, setToken] = useState(() => lsGet("ronaq_admin_token", ""));
  const [loginErr, setLoginErr] = useState("");
  const logout = useCallback(() => {
    setToken((tok) => { if (tok) convex.mutation(api.auth.logout, { token: tok }).catch(() => {}); return ""; });
    lsSet("ronaq_admin_token", "");
  }, [convex]);
  if (!token) return <Login lang={lang} err={loginErr} onToken={(tok) => { lsSet("ronaq_admin_token", tok); setLoginErr(""); setToken(tok); }} onErr={setLoginErr} />;
  return <ViewBoundary onAuth={logout} resetKey={token}><Boot key={token} token={token} lang={lang} switchLang={switchLang} logout={logout} /></ViewBoundary>;
}

function Login({ lang, err, onToken, onErr }: { lang: Lang; err: string; onToken: (t: string) => void; onErr: (e: string) => void }) {
  const convex = useConvex(), t = L[lang];
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [busy, setBusy] = useState(false), [show, setShow] = useState(false);
  function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    convex.action(api.authNode.login, { email: email.trim(), password: pw }).then((r: any) => onToken(r.token), (e2: any) => {
      setBusy(false);
      const code = e2 && e2.data && e2.data.code;
      onErr(code === "bad_login" ? t.badLogin : code === "throttled" ? t.throttled : errMsg(e2));
    });
  }
  return (
    <div className="login"><form className="panel" noValidate onSubmit={submit}>
      <h1 className="disp" style={{ margin: 0, fontSize: 28 }}>{t.login}</h1>
      {err && <div className="alert">{err}</div>}
      <div className="f"><label htmlFor="em">{t.email}</label><input id="em" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="f">
        <label htmlFor="pw">{t.password}</label>
        <div style={{ position: "relative" }}>
          <input id="pw" type={show ? "text" : "password"} autoComplete="current-password" required dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} style={{ paddingInlineEnd: 52 }} />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t.hidePw : t.showPw} aria-pressed={show} title={show ? t.hidePw : t.showPw}
            style={{ position: "absolute", insetInlineEnd: 4, top: 4, bottom: 4, width: 44, border: 0, borderRadius: 10, background: "transparent", cursor: "pointer", color: "var(--soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{show && <path d="M3 3l18 18" />}
            </svg>
          </button>
        </div>
      </div>
      <button className="btn lg" type="submit" disabled={busy}>{t.enter}</button>
    </form></div>
  );
}

function Boot({ token, lang, switchLang, logout }: { token: string; lang: Lang; switchLang: () => void; logout: () => void }) {
  const t = L[lang];
  const me = useQuery(api.auth.me, { token }) as Me | null | undefined;
  const settings = useQuery(api.settings.get, me ? { token } : "skip");
  const [geo, setGeo] = useState<Geo | null>(null);
  useEffect(() => { fetch("/data/geo.json").then((r) => r.json()).then(setGeo, () => {}); }, []);
  useEffect(() => { if (me === null) logout(); }, [me, logout]);
  if (!me || !settings || !geo) return <p style={{ padding: 40, textAlign: "center" }}>{t.loading}</p>;
  return <Shell token={token} lang={lang} me={me} settings={settings} geo={geo} switchLang={switchLang} logout={logout} />;
}

function Shell(p: { token: string; lang: Lang; me: Me; settings: any; geo: Geo; switchLang: () => void; logout: () => void }) {
  const { token, lang, me, settings, geo, switchLang, logout } = p, t = L[lang];
  const convex = useConvex();
  const can = useCallback((perm: string) => me.perms.includes(perm), [me]);
  const initial = location.hash.replace("#", "");
  const [nav, setNav] = useState<{ tab: string; extra: Record<string, string> | null }>(() => ({ tab: TABS.some((x) => x[0] === initial && me.perms.includes(x[2])) ? initial : "dash", extra: null }));

  // Toasts
  const [flashMsg, setFlashMsg] = useState<{ msg: string; bad?: boolean; id: number } | null>(null);
  const [flashShow, setFlashShow] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback((msg: string, bad?: boolean) => {
    setFlashMsg({ msg, bad, id: Date.now() }); requestAnimationFrame(() => setFlashShow(true));
    clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => setFlashShow(false), bad ? 4200 : 1900);
  }, []);

  // Confirm dialog
  const [asking, setAsking] = useState<{ text: string; done: (v: boolean) => void } | null>(null);
  const ask = useCallback((text?: string) => new Promise<boolean>((resolve) => setAsking({ text: text || t.confirmQ, done: (v) => { setAsking(null); resolve(v); } })), [t]);

  // Drawer
  const [drawer, setDrawer] = useState<ReactNode>(null);
  const [drawerShow, setDrawerShow] = useState(false);
  const lastFocus = useRef<Element | null>(null), clearTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const openDrawer = useCallback((node: ReactNode) => {
    clearTimeout(clearTimer.current);
    setDrawerShow((shown) => { if (!shown) lastFocus.current = document.activeElement; return shown; });
    setDrawer(node); requestAnimationFrame(() => setDrawerShow(true));
  }, []);
  const closeDrawer = useCallback(() => {
    setDrawerShow(false);
    clearTimer.current = setTimeout(() => setDrawer(null), 450); // unmount → live queries of the drawer stop
    try { (lastFocus.current as HTMLElement | null)?.focus(); } catch { /* ignore */ }
  }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") closeDrawer(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [closeDrawer]);

  const go = useCallback((tab: string, extra?: Record<string, string>) => {
    closeDrawer(); setNav({ tab, extra: extra || null });
    try { history.replaceState(null, "", "#" + tab); } catch { /* ignore */ }
  }, [closeDrawer]);

  // Live badge counts + new-order alert (sound after the first click on the page).
  const counts = (useQuery(api.orders.counts, { token }) || {}) as Record<string, number>;
  const firstNew = useRef<number | null>(null), audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    const on = () => { if (!audio.current) try { audio.current = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { /* ignore */ } };
    document.addEventListener("pointerdown", on, { once: true }); return () => document.removeEventListener("pointerdown", on);
  }, []);
  useEffect(() => {
    const n = counts["new"]; if (n == null) return;
    if (firstNew.current !== null && n > firstNew.current) {
      flash(fill(t.newOrderToast, { n }));
      const ac = audio.current;
      if (ac) try { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; g.gain.value = 0.06; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.18); } catch { /* ignore */ }
    }
    firstNew.current = n;
  }, [counts["new"]]); // eslint-disable-line react-hooks/exhaustive-deps

  const storeName = tx(settings.name, lang);
  const ctx: AdminCtx = { lang, t, token, me, geo, settings, storeName, counts, convex: convex as ConvexReactClient, can, flash, ask, openDrawer, closeDrawer, go, logout, switchLang };
  const View = VIEWS[nav.tab] || Dashboard;

  const tabs = TABS.filter((x) => can(x[2])).map((x) => {
    const c = x[0] === "orders" ? counts["new"] : x[0] === "abandoned" ? counts.abandoned : 0;
    return (
      <button key={x[0]} className="tab" type="button" aria-current={nav.tab === x[0] ? "page" : undefined} onClick={() => go(x[0])}>
        <Icon n={x[1]} s={20} /><span>{(t.tabs as Record<string, string>)[x[0]]}</span>{c ? <span className="cnt">{c}</span> : null}
      </button>
    );
  });

  return (
    <Ctx.Provider value={ctx}>
      <div className="ad">
        <aside className="side">
          <a className="logo" href="/" target="_blank"><Logo s={44} /></a>
          <div className="tabs" style={{ display: "flex", flexDirection: "column", gap: 6 }}>{tabs}</div>
          <div className="foot">
            <span>{me.name} · {(t.roles as Record<string, string>)[me.role]}</span>
            <button type="button" onClick={switchLang}>{t.switchLang}</button>
            <a href="/" target="_blank" rel="noopener">{t.store}</a>
            <button type="button" onClick={logout}>{t.logout}</button>
          </div>
        </aside>
        <div style={{ minWidth: 0 }}>
          <nav className="mobtabs">{tabs}</nav>
          <main className="main" id="view">
            <ViewBoundary onAuth={logout} resetKey={nav.tab}><View key={nav.tab + JSON.stringify(nav.extra)} extra={nav.extra} /></ViewBoundary>
          </main>
        </div>
      </div>
      <div className={"scrim base" + (drawerShow ? " show" : "")} onClick={closeDrawer}></div>
      <aside className={"drawer" + (drawerShow ? " show" : "")} aria-hidden={!drawerShow} role="dialog" aria-modal="true">
        <ViewBoundary onAuth={logout} resetKey={String(drawerShow)}>{drawer}</ViewBoundary>
      </aside>
      {asking && (
        <div className="scrim show" style={{ zIndex: 95, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={(e) => { if (e.target === e.currentTarget) asking.done(false); }}>
          <div className="panel" role="alertdialog" aria-modal="true" style={{ maxWidth: 420, width: "calc(100% - 32px)", display: "flex", flexDirection: "column", gap: 14 }}>
            <b style={{ fontSize: 17 }}>{asking.text}</b>
            <div className="acts"><button className="abtn red" type="button" onClick={() => asking.done(true)}>{t.yes}</button><button className="abtn" type="button" autoFocus onClick={() => asking.done(false)}>{t.cancel}</button></div>
          </div>
        </div>
      )}
      {flashMsg && <div key={flashMsg.id} className={"toast" + (flashShow ? " show" : "")} role="status" style={flashMsg.bad ? { background: "#8A1F3D" } : undefined}>{flashMsg.msg}</div>}
    </Ctx.Provider>
  );
}
