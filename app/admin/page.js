'use client';

// /admin — PACT.Health platform dashboard + controls. Single-admin, cookie-gated.
// One GET /api/admin/overview renders everything; every action re-fetches.

import { useCallback, useEffect, useState } from 'react';

const STATUS_LABEL = { active: 'Active', paused: 'Paused', blocked: 'Blocked' };

function timeAgo(iso) {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function AdminPortal() {
  const [authed, setAuthed] = useState(null); // null=checking, false=login, true=in
  const [key, setKey] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/overview', { cache: 'no-store' });
    if (res.status === 401) { setAuthed(false); return; }
    if (!res.ok) { setFlash('Could not load data — check server logs.'); return; }
    setData(await res.json());
    setAuthed(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function signIn(e) {
    e?.preventDefault?.();
    setLoginErr('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setLoginErr(j.error || 'Sign-in failed');
      return;
    }
    setKey('');
    await load();
  }

  async function signOut() {
    await fetch('/api/admin/login', { method: 'DELETE' });
    setAuthed(false);
    setData(null);
  }

  async function setStatus(kind, id, status, name) {
    let reason = null;
    if (status === 'blocked') {
      reason = window.prompt(`Block ${name}. PAX goes fully silent for them.\nReason (saved to the audit log):`);
      if (reason === null) return;
    } else if (status === 'paused') {
      if (!window.confirm(`Pause ${name}? Proactive sends stop; replies get a holding message.`)) return;
    }
    setBusy(true);
    const res = await fetch('/api/admin/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id, status, reason }),
    });
    setBusy(false);
    if (!res.ok) { setFlash('Update failed.'); return; }
    setFlash(`${name} → ${STATUS_LABEL[status]}`);
    load();
  }

  async function toggleKill(disable) {
    const msg = disable
      ? 'Kill ALL scheduled sends platform-wide? Briefs, check-ins, slip nudges, witness pings — everything stops within a minute. Inbound replies keep working.'
      : 'Resume all scheduled sends?';
    if (!window.confirm(msg)) return;
    setBusy(true);
    const res = await fetch('/api/admin/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: disable }),
    });
    setBusy(false);
    if (!res.ok) { setFlash('Update failed.'); return; }
    load();
  }

  // ---------- render ----------

  if (authed === null) {
    return <Shell><p className="muted">Checking session…</p><Styles /></Shell>;
  }

  if (authed === false) {
    return (
      <Shell>
        <div className="login">
          <h1>Platform<br />Control</h1>
          <p className="muted">This area is for the platform owner only.</p>
          <form onSubmit={signIn}>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Portal key"
              autoFocus
              autoComplete="off"
            />
            <button type="submit" className="btn red">Sign in</button>
          </form>
          {loginErr && <p className="err">{loginErr}</p>}
        </div>
        <Styles />
      </Shell>
    );
  }

  const {
    platform = {}, daily = [], coaches = [], clients = [],
    events = [], sends_disabled,
  } = data || {};

  const byCoach = new Map(coaches.map((c) => [c.id, []]));
  const orphans = [];
  clients.forEach((cl) => { (byCoach.get(cl.pt_id) || orphans).push(cl); });
  const nameOf = (id) =>
    clients.find((c) => c.id === id)?.name ||
    coaches.find((c) => c.id === id)?.name || '—';

  const maxDay = Math.max(1, ...daily.map((d) => (d.inbound || 0) + (d.outbound || 0)));

  return (
    <Shell>
      <header className="top">
        <h1>Platform Control</h1>
        <div className="topRight">
          <button className="btn ghost small" onClick={load} disabled={busy}>Refresh</button>
          <button className="btn ghost small" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {flash && <div className="flash" onClick={() => setFlash('')}>{flash}</div>}

      {/* Usage at a glance */}
      <section className="stats">
        <Stat label="Coaches" value={platform.coaches} />
        <Stat label="Athletes" value={platform.athletes} sub={`${platform.athletes_active ?? 0} active`} />
        <Stat label="Messages · 7d" value={platform.messages_7d} sub={`${platform.messages_today ?? 0} today`} />
        <Stat label="Engaged · 7d" value={platform.engaged_7d} sub="athletes who replied" />
        <Stat label="Slips · 7d" value={platform.slips_7d} alert={(platform.slips_7d ?? 0) > 0} />
      </section>

      {/* 7-day message volume */}
      <section className="chartWrap">
        <span className="eyebrow">Message volume — last 7 days</span>
        <div className="chart" role="img"
          aria-label="Daily message volume, athletes in red, PAX and coach in blue">
          {daily.length === 0 && <p className="muted small">No messages yet this week.</p>}
          {daily.map((d) => {
            const inn = d.inbound || 0, out = d.outbound || 0;
            return (
              <div className="bar" key={d.day} title={`${d.day}: ${inn} in / ${out} out`}>
                <div className="seg out" style={{ height: `${(out / maxDay) * 100}%` }} />
                <div className="seg in" style={{ height: `${(inn / maxDay) * 100}%` }} />
                <span className="barLabel">
                  {new Date(d.day).toLocaleDateString('en-GB', { weekday: 'short' })}
                </span>
              </div>
            );
          })}
        </div>
        <div className="legend">
          <span><i className="dot in" /> Athletes</span>
          <span><i className="dot out" /> PAX + coach</span>
        </div>
      </section>

      {/* Master switch */}
      <section className={`master ${sends_disabled ? 'killed' : ''}`}>
        <div>
          <span className="eyebrow">Scheduled sends</span>
          <strong>{sends_disabled ? 'KILLED — nothing goes out' : 'Live'}</strong>
        </div>
        <button
          className={`btn ${sends_disabled ? '' : 'red'}`}
          disabled={busy}
          onClick={() => toggleKill(!sends_disabled)}
        >
          {sends_disabled ? 'Resume all sends' : 'Kill all sends'}
        </button>
      </section>

      {/* Coaches + rosters */}
      {coaches.map((coach) => (
        <section className="coach" key={coach.id}>
          <div className="row head">
            <div className="coachInfo">
              <strong>{coach.name || 'Unnamed coach'}</strong>
              <StatusTag status={coach.status} />
              <span className="metrics">
                {coach.clients_total ?? 0} client{(coach.clients_total ?? 0) === 1 ? '' : 's'}
                {' · '}{coach.clients_active ?? 0} active
                {(coach.clients_paused ?? 0) > 0 && ` · ${coach.clients_paused} paused`}
                {(coach.clients_blocked ?? 0) > 0 && ` · ${coach.clients_blocked} blocked`}
                {' · '}{coach.msgs_7d ?? 0} msgs/7d
                {' · '}{coach.engaged_7d ?? 0} engaged
              </span>
            </div>
            <Controls
              status={coach.status}
              busy={busy}
              onSet={(s) => setStatus('coach', coach.id, s, coach.name || 'this coach')}
              pauseHint="Pauses their whole roster"
            />
          </div>
          {(byCoach.get(coach.id) || []).map((cl) => (
            <div className="row" key={cl.id}>
              <div>
                {cl.name || cl.wa_phone || cl.id.slice(0, 8)}
                <StatusTag status={cl.status} />
                {cl.pax_paused && <em className="note">coach driving</em>}
                {cl.snoozed_until && new Date(cl.snoozed_until) > new Date() &&
                  <em className="note">snoozed</em>}
                <span className="metrics">
                  {cl.msgs_7d ?? 0} msgs/7d · last {timeAgo(cl.last_message_at)}
                </span>
              </div>
              <Controls
                status={cl.status}
                busy={busy}
                onSet={(s) => setStatus('client', cl.id, s, cl.name || 'this athlete')}
              />
            </div>
          ))}
        </section>
      ))}

      {orphans.length > 0 && (
        <section className="coach">
          <div className="row head"><strong>No coach assigned</strong></div>
          {orphans.map((cl) => (
            <div className="row" key={cl.id}>
              <div>
                {cl.name || cl.wa_phone}
                <StatusTag status={cl.status} />
                <span className="metrics">
                  {cl.msgs_7d ?? 0} msgs/7d · last {timeAgo(cl.last_message_at)}
                </span>
              </div>
              <Controls
                status={cl.status}
                busy={busy}
                onSet={(s) => setStatus('client', cl.id, s, cl.name || 'this athlete')}
              />
            </div>
          ))}
        </section>
      )}

      {/* Audit trail */}
      <section className="coach">
        <div className="row head"><strong>Recent actions</strong></div>
        {events.length === 0 && <div className="row muted">No moderation events yet.</div>}
        {events.map((ev) => (
          <div className="row event" key={ev.id}>
            <div>
              <span className="eyebrow">{new Date(ev.created_at).toLocaleString('en-GB')}</span>
              {ev.action.replace(/_/g, ' ')} · {ev.client_id ? nameOf(ev.client_id) : ev.pt_id ? nameOf(ev.pt_id) : 'platform'}
              {ev.reason && <em className="note">“{ev.reason}”</em>}
              <em className="note">by {ev.actor}</em>
            </div>
          </div>
        ))}
      </section>

      <Styles />
    </Shell>
  );
}

function Stat({ label, value, sub, alert }) {
  return (
    <div className={`stat ${alert ? 'alert' : ''}`}>
      <span className="statValue">{value ?? 0}</span>
      <span className="statLabel">{label}</span>
      {sub && <span className="statSub">{sub}</span>}
    </div>
  );
}

function StatusTag({ status }) {
  if (!status || status === 'active') return null;
  return <span className={`tag ${status}`}>{STATUS_LABEL[status]}</span>;
}

function Controls({ status, onSet, busy, pauseHint }) {
  return (
    <div className="controls">
      {status !== 'active' && (
        <button className="btn small" disabled={busy} onClick={() => onSet('active')}>Reactivate</button>
      )}
      {status === 'active' && (
        <button className="btn small ghost" disabled={busy} onClick={() => onSet('paused')} title={pauseHint}>Pause</button>
      )}
      {status !== 'blocked' && (
        <button className="btn small redline" disabled={busy} onClick={() => onSet('blocked')}>Block</button>
      )}
    </div>
  );
}

function Shell({ children }) {
  return <main className="admin-shell">{children}</main>;
}

function Styles() {
  return (
    <style>{`
      .admin-shell {
        --blue:#0A2540; --red:#D92D20; --white:#FFFFFF;
        --bg:#F6F8FA; --border:#E3E8EE; --muted:#5B7083;
        max-width: 860px; margin: 0 auto; padding: 28px 18px 80px;
        font-family: Inter, -apple-system, sans-serif; color: var(--blue);
        min-height: 100vh;
      }
      .admin-shell h1 {
        font-family: Montserrat, Inter, sans-serif; font-weight: 900;
        font-size: 26px; letter-spacing: -0.5px; text-transform: uppercase;
        line-height: 1.05; margin: 0;
      }
      .top { display:flex; justify-content:space-between; align-items:center; margin-bottom:22px; }
      .topRight { display:flex; gap:8px; }
      .eyebrow { display:block; font-size:10px; letter-spacing:1.2px; text-transform:uppercase;
        font-weight:700; color:var(--muted); margin-bottom:2px; }
      .muted { color: var(--muted); }
      .small { font-size:12px; }
      .err { color: var(--red); font-weight:600; font-size:13px; }
      .note { font-style:normal; font-size:11px; color:var(--muted); margin-left:8px; }
      .metrics { display:block; font-size:11.5px; color:var(--muted); margin-top:2px; }

      .flash { background:var(--blue); color:var(--white); padding:10px 14px;
        font-size:13px; margin-bottom:14px; cursor:pointer; }

      .stats { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:14px; }
      .stat { background:var(--white); border:1px solid var(--border); padding:14px 14px 12px; }
      .stat.alert { border-left:3px solid var(--red); }
      .statValue { display:block; font-family:Montserrat, sans-serif; font-weight:900;
        font-size:26px; line-height:1; }
      .statLabel { display:block; font-size:10px; letter-spacing:1px; text-transform:uppercase;
        font-weight:700; color:var(--muted); margin-top:5px; }
      .statSub { display:block; font-size:11px; color:var(--muted); margin-top:2px; }

      .chartWrap { background:var(--white); border:1px solid var(--border);
        padding:14px 16px 10px; margin-bottom:14px; }
      .chart { display:flex; align-items:flex-end; gap:8px; height:110px; padding-top:8px; }
      .bar { flex:1; display:flex; flex-direction:column; justify-content:flex-end;
        align-items:stretch; height:100%; position:relative; }
      .seg { width:100%; min-height:0; }
      .seg.out { background:var(--blue); }
      .seg.in { background:var(--red); }
      .barLabel { text-align:center; font-size:9.5px; letter-spacing:0.6px;
        text-transform:uppercase; font-weight:700; color:var(--muted); margin-top:4px; }
      .legend { display:flex; gap:16px; font-size:11px; color:var(--muted); margin-top:8px; }
      .dot { display:inline-block; width:9px; height:9px; margin-right:5px; }
      .dot.in { background:var(--red); }
      .dot.out { background:var(--blue); }

      .master { display:flex; justify-content:space-between; align-items:center; gap:14px;
        background:var(--white); border:1px solid var(--border);
        padding:18px 20px; margin-bottom:26px; }
      .master strong { font-family:Montserrat, sans-serif; font-weight:800; font-size:17px; }
      .master.killed { border:2px solid var(--red); }
      .master.killed strong { color: var(--red); }

      .coach { background:var(--white); border:1px solid var(--border); margin-bottom:18px; }
      .row { display:flex; justify-content:space-between; align-items:center; gap:12px;
        padding:11px 16px; border-top:1px solid var(--border); font-size:14px; }
      .row:first-child { border-top:none; }
      .row.head { background:var(--bg); }
      .row.head strong { font-family:Montserrat, sans-serif; font-weight:800;
        text-transform:uppercase; letter-spacing:0.4px; font-size:13px; }
      .row.event { font-size:12.5px; }
      .coachInfo { min-width:0; }

      .tag { display:inline-block; margin-left:8px; padding:2px 7px; font-size:10px;
        font-weight:800; letter-spacing:0.8px; text-transform:uppercase; }
      .tag.paused { background:var(--bg); color:var(--muted); border:1px solid var(--border); }
      .tag.blocked { background:var(--red); color:var(--white); }

      .controls { display:flex; gap:8px; flex-shrink:0; }
      .btn { font-family:Montserrat, sans-serif; font-weight:800; font-size:12px;
        letter-spacing:0.6px; text-transform:uppercase; cursor:pointer;
        padding:9px 16px; border:1.5px solid var(--blue); background:var(--blue);
        color:var(--white); border-radius:0; }
      .btn:disabled { opacity:0.5; cursor:default; }
      .btn.red { background:var(--red); border-color:var(--red); }
      .btn.ghost { background:transparent; color:var(--blue); }
      .btn.redline { background:transparent; color:var(--red); border-color:var(--red); }
      .btn.small { padding:6px 11px; font-size:10.5px; }
      .btn:focus-visible { outline:3px solid var(--red); outline-offset:2px; }

      .login { max-width:340px; margin:12vh auto 0; }
      .login h1 { font-size:34px; margin-bottom:10px; }
      .login p { margin:0 0 22px; font-size:14px; }
      .login form { display:flex; flex-direction:column; gap:10px; }
      .login input { padding:12px 14px; border:1.5px solid var(--blue); font-size:15px;
        font-family:inherit; border-radius:0; background:var(--white); color:var(--blue); }
      .login input:focus { outline:3px solid var(--red); outline-offset:1px; }

      @media (max-width:700px) {
        .stats { grid-template-columns:repeat(2,1fr); }
        .row { flex-direction:column; align-items:flex-start; }
        .controls { align-self:flex-end; }
        .master { flex-direction:column; align-items:flex-start; }
      }
    `}</style>
  );
}
