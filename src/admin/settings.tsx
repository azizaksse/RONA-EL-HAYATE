import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { Icon } from "../lib/icons";
import { CommuneOptions, DrawerHead, errMsg, keep, Loading, remember, Top, useAdmin, useFmt, useQ, useRun, WilayaOptions } from "./core";

const num = (v: string) => (v === "" || v == null ? null : Number(v));
const cell = { width: 110, height: 40, border: "1px solid var(--line2)", borderRadius: 10, padding: "0 10px" } as const;

/** Carrier key field definitions (must match convex/carrierKeys.ts CARRIER_KEY_FIELDS). */
const KEY_FIELDS: Record<string, { label: string; fields: { key: string; label: string; placeholder?: string; optional?: boolean }[] }> = {
  yalidine: { label: "Yalidine", fields: [{ key: "YALIDINE_API_ID", label: "API ID" }, { key: "YALIDINE_API_TOKEN", label: "API Token" }, { key: "YALIDINE_BASE_URL", label: "Base URL (proxy)", placeholder: "https://api.yalidine.app/v1", optional: true }, { key: "YALIDINE_PROXY_SECRET", label: "Proxy Secret", optional: true }] },
  zr_express: { label: "ZR Express", fields: [{ key: "ZR_API_KEY", label: "API Key" }, { key: "ZR_TENANT_ID", label: "Tenant ID" }] },
  noest: { label: "NOEST Express", fields: [{ key: "NOEST_API_TOKEN", label: "API Token" }, { key: "NOEST_USER_GUID", label: "User GUID" }] },
  ecotrack: { label: "World Express (EcoTrack)", fields: [{ key: "ECOTRACK_BASE_URL", label: "Base URL", placeholder: "https://world-express.ecotrack.dz" }, { key: "ECOTRACK_TOKEN", label: "API Token" }, { key: "ECOTRACK_NAME", label: "Carrier Name", placeholder: "World Express", optional: true }] },
  meta: { label: "Meta Conversions API", fields: [{ key: "META_ACCESS_TOKEN", label: "Access Token" }, { key: "META_PIXEL_ID", label: "Pixel ID" }, { key: "META_TEST_EVENT_CODE", label: "Test Event Code", optional: true }] },
};

/* ================= Delivery ================= */
export function Delivery() {
  const { t } = useAdmin();
  const [sub, setSub] = useState<string>(() => remember("dtab", "carriers"));
  const pick = (s: string) => { keep("dtab", s); setSub(s); };
  return (<>
    <Top title={t.tabs.delivery}>
      <div className="seg" role="group">
        <button type="button" aria-pressed={sub === "carriers"} onClick={() => pick("carriers")}>{t.dl.carriers}</button>
        <button type="button" aria-pressed={sub === "keys"} onClick={() => pick("keys")}>{t.dl.apiKeys || "API Keys"}</button>
        <button type="button" aria-pressed={sub === "rates"} onClick={() => pick("rates")}>{t.dl.rates}</button>
      </div>
    </Top>
    <div id="dbody">{sub === "carriers" ? <Carriers /> : sub === "keys" ? <ApiKeys /> : <Rates />}</div>
  </>);
}

function Carriers() {
  const { t, can, flash } = useAdmin(), F = useFmt(), R = useRun();
  const d = useQ(api.dispatch.carrierList, {}) as any;
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  if (!d) return <Loading />;
  const canSet = can("settings");
  const withBusy = (k: string, p: Promise<any>) => { setBusy((b) => ({ ...b, [k]: true })); p.finally(() => setBusy((b) => ({ ...b, [k]: false }))); };
  return (<>
    <div className="cards2">
      {d.carriers.map((c: any) => (
        <div className="box" key={c.code}>
          <h2>{c.label}{c.configured ? <span className="st delivered">{t.dl.connected}</span> : <span className="st cancelled">{t.dl.missing}</span>}</h2>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>{F.fill(t.dl.desks, { n: c.stopDesks })}{d.defaultCarrier === c.code && <> · <b style={{ color: "var(--teal)" }}>{t.dl.default}</b></>}</p>
          {c.configured && canSet && (
            <div className="acts">
              <button className="abtn" type="button" disabled={busy["t" + c.code]} onClick={() => withBusy("t" + c.code, R.a(api.dispatch.testCarrier, { carrier: c.code }).then((r: any) => flash(r.message, !r.ok), (e) => flash(errMsg(e), true)))}>{t.dl.test}</button>
              <button className="abtn" type="button" disabled={busy["s" + c.code]} onClick={() => withBusy("s" + c.code, R.a(api.dispatch.syncCarrierData, { carrier: c.code }).then((r: any) => flash(F.fill(t.dl.desks, { n: r.desks }) + (r.communes ? " · " + r.communes : "")), (e) => flash(errMsg(e), true)))}>
                {busy["s" + c.code] ? t.loading : <><Icon n="refresh" s={18} />{t.dl.sync}</>}
              </button>
              {d.defaultCarrier !== c.code && <button className="abtn pri" type="button" onClick={() => R.runM(api.settings.update, { patch: { defaultCarrier: c.code } } as any).catch(() => {})}>{t.dl.default}</button>}
            </div>
          )}
        </div>
      ))}
      <div className="box">
        <h2>{t.dl.meta}{d.meta.configured ? <span className="st delivered">{t.dl.metaOn}{d.meta.testMode ? " · " + t.dl.metaTest : ""}</span> : <span className="st cancelled">{t.dl.metaOff}</span>}</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>Lead → Purchase (confirmed) → OrderDelivered</p>
      </div>
    </div>
    {can("orders.ship") && (
      <div className="acts" style={{ marginTop: 14 }}>
        <button className="abtn pri" type="button" disabled={busy.sync} onClick={() => withBusy("sync", R.runA(api.dispatch.syncNow, {}).catch(() => {}))}><Icon n="refresh" s={18} />{t.dl.syncStatus}</button>
      </div>
    )}
    <div className="box" style={{ marginTop: 14 }}>
      <h2>{t.dl.logs}</h2>
      {d.logs.length ? <ul className="hist">{d.logs.map((l: any, i: number) => (
        <li key={i}><b>{l.carrier}</b> · {l.kind} · <span style={{ color: l.ok ? "var(--teal)" : "var(--err)" }}>{l.message}</span><time>{F.dt(l.at)}</time></li>
      ))}</ul> : <p className="muted" style={{ margin: 0 }}>{t.none}</p>}
    </div>
  </>);
}

/* ================= API Keys ================= */
function ApiKeys() {
  const { t, flash } = useAdmin(), R = useRun();
  const saved = useQ(api.carrierKeys.list, {}) as Record<string, Record<string, string>> | undefined;
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  if (!saved) return <Loading />;

  const val = (carrier: string, key: string) => {
    if (edits[carrier]?.[key] !== undefined) return edits[carrier][key];
    return saved[carrier]?.[key] || "";
  };
  const set = (carrier: string, key: string, value: string) => {
    setEdits((e) => ({ ...e, [carrier]: { ...(e[carrier] || {}), [key]: value } }));
  };

  const saveCarrier = (carrier: string) => {
    const keys: Record<string, string> = {};
    for (const f of KEY_FIELDS[carrier].fields) keys[f.key] = val(carrier, f.key);
    setSaving((s) => ({ ...s, [carrier]: true }));
    R.runM(api.carrierKeys.save, { carrier, keys } as any).then(() => {
      setEdits((e) => { const n = { ...e }; delete n[carrier]; return n; });
      flash(t.saved);
    }, () => {}).finally(() => setSaving((s) => ({ ...s, [carrier]: false })));
  };

  return (<>
    <p className="muted" style={{ margin: "0 0 16px", fontSize: 14 }}>{t.dl.keysHelp || "أضيفي مفاتيح API لشركات التوصيل هنا. بعد الحفظ، اختبري الاتصال من تبويب «شركات التوصيل»."}</p>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {Object.entries(KEY_FIELDS).map(([carrier, def]) => {
        const hasKeys = def.fields.some((f) => !f.optional && saved[carrier]?.[f.key] && saved[carrier][f.key] !== "");
        return (
          <details key={carrier} className="box" style={{ padding: "14px 18px" }} open={!hasKeys}>
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 16, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>{def.label}</span>
              {hasKeys ? <span className="st delivered" style={{ fontSize: 12 }}>{t.dl.connected}</span> : <span className="st cancelled" style={{ fontSize: 12 }}>{t.dl.missing}</span>}
            </summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              {def.fields.map((f) => (
                <div className="f" key={f.key}>
                  <label htmlFor={"k-" + carrier + "-" + f.key} style={{ fontSize: 14 }}>
                    {f.label}{f.optional ? <span className="muted"> ({t.optional})</span> : <span style={{ color: "var(--err)" }}> *</span>}
                  </label>
                  <input
                    id={"k-" + carrier + "-" + f.key}
                    type={f.key.includes("TOKEN") || f.key.includes("SECRET") || f.key.includes("KEY") ? "password" : "text"}
                    placeholder={f.placeholder || ""}
                    value={val(carrier, f.key)}
                    onChange={(e) => set(carrier, f.key, e.target.value)}
                    dir="ltr"
                    autoComplete="off"
                    style={{ fontFamily: "monospace", fontSize: 14 }}
                  />
                </div>
              ))}
              <div className="acts">
                <button className="abtn pri" type="button" disabled={saving[carrier]} onClick={() => saveCarrier(carrier)}>
                  {saving[carrier] ? t.loading : <><Icon n="check" s={18} />{t.save}</>}
                </button>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  </>);
}

function Rates() {
  const { t, lang, can, openDrawer } = useAdmin(), R = useRun();
  const d = useQ(api.shipping.rates, {}) as any;
  const [zone, setZone] = useState<Record<string, string> | null>(null);
  const [row, setRow] = useState<Record<string, { h: string; d: string }>>({});
  if (!d) return <Loading />;
  const canSet = can("settings"), z = d.zoneFees;
  const zv = (k: string, m: "home" | "desk") => (zone && zone[k + m] != null ? zone[k + m] : String(z[k][m]));
  const rv = (r: any) => row[r.code] || { h: r.home == null ? "" : String(r.home), d: r.desk == null ? "" : String(r.desk) };
  const zones = t.dl.zones as Record<string, string>;

  return (<>
    <div className="box">
      <h2>{t.dl.zoneDefaults}</h2>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
        {["A", "N", "S"].map((k) => (
          <div key={k}>
            <p className="sec-t">{zones[k]}</p>
            <div className="mini-f">
              <label className="sr" htmlFor={"z" + k + "h"}>{t.cols.home}</label>
              <input id={"z" + k + "h"} type="number" disabled={!canSet} placeholder={t.cols.home} value={zv(k, "home")} onChange={(e) => setZone({ ...(zone || {}), [k + "home"]: e.target.value })} />
              <label className="sr" htmlFor={"z" + k + "d"}>{t.cols.desk}</label>
              <input id={"z" + k + "d"} type="number" disabled={!canSet} placeholder={t.cols.desk} value={zv(k, "desk")} onChange={(e) => setZone({ ...(zone || {}), [k + "desk"]: e.target.value })} />
            </div>
            <small className="muted">{t.cols.home} / {t.cols.desk}</small>
          </div>
        ))}
      </div>
      {canSet && <button className="abtn pri" type="button" style={{ marginTop: 10 }} onClick={() => {
        const zf: any = {}; ["A", "N", "S"].forEach((k) => { zf[k] = { home: Number(zv(k, "home")) || 0, desk: Number(zv(k, "desk")) || 0 }; });
        R.runM(api.settings.update, { patch: { zoneFees: zf } } as any).then(() => setZone(null), () => {});
      }}>{t.save}</button>}
    </div>
    <div className="tscroll" style={{ marginTop: 14 }}><table className="tbl">
      <thead><tr><th>{t.cols.wilaya}</th><th>{t.dl.zone}</th><th>{t.cols.home}</th><th>{t.cols.desk}</th><th>{t.dl.communeRates}</th>{canSet && <th>{t.cols.action}</th>}</tr></thead>
      <tbody>{d.rows.map((r: any) => { const x = rv(r); return (
        <tr key={r.code} style={{ cursor: "default" }}>
          <td>{(r.code < 10 ? "0" : "") + r.code} - {lang === "ar" ? r.nameAr : r.name}{r.custom && <> <span className="tag">{t.dl.custom}</span></>}</td>
          <td>{zones[r.zone]}</td>
          <td><input type="number" value={x.h} placeholder={t.dl.notOffered} style={cell} disabled={!canSet} aria-label={t.cols.home} onChange={(e) => setRow({ ...row, [r.code]: { ...x, h: e.target.value } })} /></td>
          <td><input type="number" value={x.d} placeholder={t.dl.notOffered} style={cell} disabled={!canSet} aria-label={t.cols.desk} onChange={(e) => setRow({ ...row, [r.code]: { ...x, d: e.target.value } })} /></td>
          <td>
            {r.communes.map((c: any) => (
              <span className="tag" key={c.commune}>{c.commune}: {c.home == null ? "—" : c.home} / {c.desk == null ? "—" : c.desk}
                {canSet && <> <button type="button" aria-label={t.del} style={{ border: 0, background: "none", cursor: "pointer", color: "inherit" }} onClick={() => R.runM(api.shipping.setRate, { wilayaCode: r.code, commune: c.commune, home: null, desk: null, reset: true } as any).catch(() => {})}>×</button></>}
              </span>
            ))}
            {canSet && <button type="button" className="abtn" style={{ minHeight: 34, padding: "0 10px", fontSize: 13 }} onClick={() => openDrawer(<CommuneRate key={"cr" + r.code} code={r.code} />)}>{t.dl.addCommune}</button>}
          </td>
          {canSet && <td><div className="acts">
            <button type="button" className="abtn pri" style={{ minHeight: 38 }} onClick={() => R.runM(api.shipping.setRate, { wilayaCode: r.code, home: num(x.h), desk: num(x.d) } as any).then(() => setRow((o) => { const n = { ...o }; delete n[r.code]; return n; }), () => {})}>{t.save}</button>
            {r.custom && <button type="button" className="abtn" style={{ minHeight: 38 }} onClick={() => R.runM(api.shipping.setRate, { wilayaCode: r.code, home: null, desk: null, reset: true } as any).then(() => setRow((o) => { const n = { ...o }; delete n[r.code]; return n; }), () => {})}>{t.dl.reset}</button>}
          </div></td>}
        </tr>
      ); })}</tbody>
    </table></div>
  </>);
}

function CommuneRate({ code }: { code: number }) {
  const { t, geo, closeDrawer } = useAdmin(), F = useFmt(), R = useRun();
  const [commune, setCommune] = useState(() => geo.communes[String(code)]?.[0]?.[0] || "");
  const [h, setH] = useState(""), [d, setD] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    R.runM(api.shipping.setRate, { wilayaCode: code, commune, home: num(h), desk: num(d) } as any).then(closeDrawer, () => {});
  }
  return (<>
    <DrawerHead title={t.dl.addCommune + " · " + F.wname(code)} />
    <div className="db"><form className="fields" noValidate onSubmit={submit}>
      <div className="f"><label htmlFor="cc">{t.commune}</label><select id="cc" value={commune} onChange={(e) => setCommune(e.target.value)}><CommuneOptions code={code} /></select></div>
      <div className="two">
        <div className="f"><label htmlFor="ch">{t.cols.home}</label><input id="ch" type="number" placeholder={t.dl.notOffered} value={h} onChange={(e) => setH(e.target.value)} /></div>
        <div className="f"><label htmlFor="cd">{t.cols.desk}</label><input id="cd" type="number" placeholder={t.dl.notOffered} value={d} onChange={(e) => setD(e.target.value)} /></div>
      </div>
      <button className="btn lg" type="submit">{t.save}</button>
    </form></div>
  </>);
}

/* ================= Team ================= */
const ROLES = ["owner", "manager", "confirmer", "logistics"];

export function Team() {
  const { t, openDrawer } = useAdmin(), F = useFmt(), R = useRun();
  const ms = useQ(api.auth.listMembers, {}) as any[] | undefined;
  const roles = t.roles as Record<string, string>;
  return (<>
    <Top title={t.team.title}><button className="abtn pri" type="button" onClick={() => openDrawer(<AddMember key={"am" + Date.now()} />)}><Icon n="plus" s={18} />{t.team.add}</button></Top>
    <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>{t.team.perms}</p>
    <div id="tlist">
      {!ms ? <Loading /> : (
        <div className="tscroll"><table className="tbl">
          <thead><tr><th>{t.name}</th><th>{t.team.role}</th><th>{t.cols.status}</th><th>{t.team.lastLogin}</th><th>{t.cols.action}</th></tr></thead>
          <tbody>{ms.map((m) => (
            <tr key={m.id} style={{ cursor: "default" }}>
              <td><b style={{ fontWeight: 500 }}>{m.name}</b><br /><small className="muted">{m.email}</small></td>
              <td><select aria-label={t.team.role} value={m.role} style={{ height: 40, border: "1px solid var(--line2)", borderRadius: 10, padding: "0 8px" }} onChange={(e) => R.runM(api.auth.updateMember, { memberId: m.id, role: e.target.value as any }).catch(() => {})}>
                {ROLES.map((r) => <option key={r} value={r}>{roles[r]}</option>)}
              </select></td>
              <td>{m.active ? <span className="st delivered">{t.team.active}</span> : <span className="st cancelled">{t.team.disabled}</span>}</td>
              <td className="num">{m.lastLoginAt ? F.ago(m.lastLoginAt) : "—"}</td>
              <td><div className="acts">
                <button className="abtn" type="button" onClick={() => R.runM(api.auth.updateMember, { memberId: m.id, active: !m.active }).catch(() => {})}>{m.active ? t.team.disabled : t.team.active}</button>
                <button className="abtn" type="button" onClick={() => openDrawer(<ResetPassword key={"pw" + m.id} memberId={m.id} />)}>{t.team.reset}</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  </>);
}

function AddMember() {
  const { t, closeDrawer } = useAdmin(), R = useRun();
  const [v, setV] = useState({ name: "", email: "", role: "confirmer", password: "" });
  const roles = t.roles as Record<string, string>;
  return (<>
    <DrawerHead title={t.team.add} />
    <div className="db"><form className="fields" noValidate onSubmit={(e) => { e.preventDefault(); R.runA(api.authNode.addMember, v as any).then(closeDrawer, () => {}); }}>
      <div className="f"><label htmlFor="tn">{t.name}</label><input id="tn" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div className="f"><label htmlFor="te">{t.email}</label><input id="te" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></div>
      <div className="f"><label htmlFor="tr">{t.team.role}</label><select id="tr" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{roles[r]}</option>)}</select></div>
      <div className="f"><label htmlFor="tp">{t.team.newPass}</label><input id="tp" type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></div>
      <button className="btn lg" type="submit">{t.add}</button>
    </form></div>
  </>);
}

function ResetPassword({ memberId }: { memberId: string }) {
  const { t, closeDrawer } = useAdmin(), R = useRun();
  const [pw, setPw] = useState("");
  return (<>
    <DrawerHead title={t.team.reset} />
    <div className="db"><form className="fields" noValidate onSubmit={(e) => { e.preventDefault(); R.runA(api.authNode.setPassword, { memberId: memberId as any, password: pw }).then(closeDrawer, () => {}); }}>
      <div className="f"><label htmlFor="np">{t.team.newPass}</label><input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
      <button className="btn lg" type="submit">{t.save}</button>
    </form></div>
  </>);
}

/* ================= Settings ================= */
export function Settings() {
  const { t } = useAdmin();
  const s = useQ(api.settings.get, {}) as any;
  return (<>
    <Top title={t.tabs.settings} />
    {!s ? <Loading /> : <div className="cards2"><StoreSettings s={s} /><MyPassword /></div>}
  </>);
}

function StoreSettings({ s }: { s: any }) {
  const { t, can } = useAdmin(), R = useRun();
  const canSet = can("settings");
  const [v, setV] = useState(() => ({
    nar: s.name.ar, nfr: s.name.fr, tar: s.tagline.ar, tfr: s.tagline.fr, ph: s.phone, wa: s.whatsapp,
    car: s.confirmDelay.ar, cfr: s.confirmDelay.fr, dar: s.deliveryDelay.ar, dfr: s.deliveryDelay.fr,
    free: String(s.freeShippingFrom ?? 0), max: String(s.maxOrdersPerPhonePerDay ?? 3), or: String(s.originWilaya ?? 16), open: !!s.canOpenParcel,
    fb: s.fbPixelId || "", tt: s.tiktokPixelId || "",
  }));
  const f = (k: keyof typeof v, label: string, type = "text") => (
    <div className="f"><label htmlFor={"s-" + k}>{label}</label><input id={"s-" + k} type={type} value={v[k] as string} disabled={!canSet} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
  );
  function submit(e: FormEvent) {
    e.preventDefault(); if (!canSet) return;
    const x = (k: keyof typeof v) => String(v[k]).trim();
    R.runM(api.settings.update, { patch: {
      name: { ar: x("nar"), fr: x("nfr") }, tagline: { ar: x("tar"), fr: x("tfr") }, phone: x("ph"), whatsapp: x("wa").replace(/\D/g, ""),
      confirmDelay: { ar: x("car"), fr: x("cfr") }, deliveryDelay: { ar: x("dar"), fr: x("dfr") }, freeShippingFrom: Number(x("free")) || 0,
      maxOrdersPerPhonePerDay: Math.max(1, Number(x("max")) || 3), originWilaya: Number(x("or")), canOpenParcel: v.open, fbPixelId: x("fb"), tiktokPixelId: x("tt"),
    } } as any).catch(() => {});
  }
  return (
    <form className="box fields" noValidate onSubmit={submit}>
      <h2>{t.set.store}</h2>
      <div className="two">{f("nar", t.set.nameAr)}{f("nfr", t.set.nameFr)}</div>
      <div className="two">{f("tar", t.set.taglineAr)}{f("tfr", t.set.taglineFr)}</div>
      <div className="two">{f("ph", t.set.phone)}{f("wa", t.set.whatsapp)}</div>
      <div className="two">{f("car", t.set.confirmAr)}{f("cfr", t.set.confirmFr)}</div>
      <div className="two">{f("dar", t.set.delivAr)}{f("dfr", t.set.delivFr)}</div>
      <div className="two">{f("free", t.set.free, "number")}{f("max", t.set.maxDay, "number")}</div>
      <div className="f"><label htmlFor="s-or">{t.set.origin}</label><select id="s-or" disabled={!canSet} value={v.or} onChange={(e) => setV({ ...v, or: e.target.value })}><WilayaOptions /></select></div>
      <label style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 44 }}><input type="checkbox" checked={v.open} disabled={!canSet} onChange={(e) => setV({ ...v, open: e.target.checked })} style={{ width: 20, height: 20 }} /> {t.set.canOpen}</label>
      <div className="two">{f("fb", t.set.fb)}{f("tt", t.set.tt)}</div>
      {canSet && <button className="btn lg" type="submit">{t.save}</button>}
    </form>
  );
}

function MyPassword() {
  const { t } = useAdmin(), R = useRun();
  const [cur, setCur] = useState(""), [pw, setPw] = useState("");
  return (
    <form className="box fields" noValidate onSubmit={(e) => { e.preventDefault(); R.runA(api.authNode.setPassword, { current: cur.trim(), password: pw.trim() }).then(() => { setCur(""); setPw(""); }, () => {}); }}>
      <h2>{t.set.myPass}</h2>
      <div className="f"><label htmlFor="p-cur">{t.set.current}</label><input id="p-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
      <div className="f"><label htmlFor="p-new">{t.team.newPass}</label><input id="p-new" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
      <button className="btn lg" type="submit">{t.save}</button>
    </form>
  );
}
