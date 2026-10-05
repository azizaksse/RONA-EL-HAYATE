import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { DEMO } from "../lib/config";
import { bump, cleanPhone } from "../lib/format";
import { Icon, Logo } from "../lib/icons";
import { NAV } from "./infoNav";
import { useStore } from "./StoreContext";

/** Fade-in sections (.rv) as they scroll into view. Re-run whenever the page content changes. */
export function useReveal(deps: unknown[]) {
  useEffect(() => {
    const els = document.querySelectorAll(".rv:not(.in)");
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((en) => en.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.1, rootMargin: "0px 0px -30px 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function Topbar() {
  const { t, data } = useStore(), S = data.store;
  const msgs = [t.top1, t.top2, t.top3 + " " + S.phone];
  const [i, setI] = useState(0);
  const rot = useRef<HTMLSpanElement>(null);
  useEffect(() => { const id = setInterval(() => setI((x) => (x + 1) % 3), 3200); return () => clearInterval(id); }, []);
  useEffect(() => { if (i && rot.current?.animate) rot.current.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 400 }); }, [i]);
  return (
    <div className="topbar">
      <span className="i"><Icon n="cash" s={16} />{t.top1}</span>
      <span className="i"><Icon n="truck" s={16} />{t.top2}</span>
      <span className="i"><Icon n="phone" s={16} />{t.top3} <span dir="ltr">{S.phone}</span></span>
      <span className="rot" aria-live="polite" ref={rot}>{msgs[i]}</span>
    </div>
  );
}

function Header() {
  const { t, tx, data, lang, setLang, cartCount, badgeBump } = useStore(), S = data.store;
  const [scrolled, setScrolled] = useState(false);
  const badge = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let ticking = false;
    const on = () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { setScrolled(window.scrollY > 8); ticking = false; }); };
    window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => { if (badgeBump) bump(badge.current); }, [badgeBump]);
  const navCats = data.categories.filter((c) => !c.parent).slice(0, 6);
  return (
    <header className={"hdr" + (scrolled ? " scrolled" : "")}>
      <div className="wrap">
        <Link className="logo" to="/"><Logo s={48} /></Link>
        <nav className="nav" aria-label={t.catTitle}>
          {navCats.map((c) => <Link key={c.slug} to={"/?cat=" + encodeURIComponent(c.slug) + "#catalog"}>{tx(c.name)}</Link>)}
        </nav>
        <div className="hdr-r">
          <div className="lang" role="group" aria-label={t.langLabel}>
            <button type="button" aria-pressed={lang === "ar"} onClick={() => setLang("ar")}>ع</button>
            <button type="button" aria-pressed={lang === "fr"} onClick={() => setLang("fr")}>FR</button>
          </div>
          <Link className="cartbtn" to="/cart" aria-label={t.cart}><Icon n="bag" s={22} /><span className="n" ref={badge}>{cartCount || ""}</span></Link>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const { t, tx, data, lang } = useStore(), S = data.store, n = NAV[lang];
  const wa = String(S.whatsapp || "").replace(/\D/g, "");
  return (
    <footer className="ftr"><div className="wrap">
      <div className="cols">
        <div className="col"><Link className="logo" to="/" style={{ color: "#fff", display: 'flex', alignItems: 'center' }}><Logo s={56} /></Link><span className="c" style={{ lineHeight: 1.7, maxWidth: 320 }}>{t.about}</span></div>
        <div className="col"><b>{t.fShop}</b>{data.categories.filter((c) => !c.parent).slice(0, 5).map((c) => <Link key={c.slug} to={"/?cat=" + encodeURIComponent(c.slug) + "#catalog"}>{tx(c.name)}</Link>)}</div>
        <div className="col"><b>{t.fHelp}</b><Link to="/#how">{t.fHow}</Link><Link to="/delivery">{n.delivery}</Link><Link to="/returns">{n.returns}</Link><Link to="/faq">{n.faq}</Link><Link to="/cart">{t.cart}</Link></div>
        <div className="col"><b>{t.fContact}</b><Link to="/contact">{n.contact}</Link><a href={"tel:" + cleanPhone(S.phone)} dir="ltr" style={{ alignSelf: "flex-start" }}>{S.phone}</a>{wa && <a href={"https://wa.me/" + wa} target="_blank" rel="noopener">WhatsApp</a>}<Link to="/about">{n.about}</Link></div>
      </div>
      <div className="bot">
        <span>{t.disclaimer}</span>
        <span style={{ display: "flex", gap: 16, flexWrap: "wrap" }}><Link to="/privacy">{n.privacy}</Link><Link to="/terms">{n.terms}</Link><span>© {new Date().getFullYear()} {tx(S.name)}</span></span>
      </div>
    </div></footer>
  );
}

/** Scroll to #hash after navigation (content is rendered by then), otherwise to the top. */
function ScrollManager() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    const el = hash && document.getElementById(hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView(), 60); else window.scrollTo(0, 0);
  }, [pathname, search, hash]);
  return null;
}

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useStore();
  return (<>
    <ScrollManager />
    {DEMO && <div style={{ background: "#FFF4D6", color: "#5C4300", fontSize: 13, textAlign: "center", padding: "6px 16px" }}>{t.demo}</div>}
    <Topbar />
    <Header />
    <main id="app">{children}</main>
    <Footer />
  </>);
}

export function Steps() {
  const { t, tx, fill, data } = useStore();
  return (
    <div className="steps">
      {t.steps.map((s, i) => <div className="step rv" key={i}><div className="n">{i + 1}</div><div><b>{s[0]}</b><p>{fill(s[1], { confirm: tx(data.store.confirmDelay) })}</p></div></div>)}
    </div>
  );
}
