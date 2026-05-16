import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';

function timeAgo(iso) {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB');
}

export default async function ClientDetailPage({ params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const service = createServiceClient();

  const { data: pt } = await service
    .from('personal_trainers')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  const { data: client } = await service
    .from('clients')
    .select('*')
    .eq('id', params.id)
    .eq('pt_id', pt?.id || null)
    .maybeSingle();

  if (!client) notFound();

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const [msgsR, slipsR, pactsR, healthR, weighR] = await Promise.all([
    service.from('conversations')
      .select('role, content, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(20),
    service.from('slip_events')
      .select('event_type, detected_at, date_for, context')
      .eq('client_id', client.id)
      .gte('detected_at', fourteenDaysAgo.toISOString())
      .order('detected_at', { ascending: false }),
    service.from('daily_pacts')
      .select('date, status, wins_completed, total_wins')
      .eq('client_id', client.id)
      .order('date', { ascending: false })
      .limit(14),
    service.from('health_data')
      .select('steps, calories, protein, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(1),
    // Pull the latest weigh-in — prefer this over stale clients.current_weight
    service.from('weigh_ins')
      .select('weight, date, created_at')
      .eq('client_id', client.id)
      .not('weight', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const messages = msgsR.data || [];
  const slips    = slipsR.data || [];
  const pacts    = pactsR.data || [];
  const latest   = healthR.data?.[0] || null;
  const lastWeigh = weighR.data?.[0] || null;

  // Prefer the most recent weigh-in over the (potentially stale) clients.current_weight
  const currentWeight = lastWeigh?.weight ?? client.current_weight;

  const lost = client.start_weight && currentWeight
    ? Number((client.start_weight - currentWeight).toFixed(1))
    : null;
  const toGo = currentWeight && client.target_weight
    ? Number((currentWeight - client.target_weight).toFixed(1))
    : null;

  const firstName = client.name?.split(' ')[0] || client.name;

  return (
    <div className="px-8 lg:px-10 py-8 lg:py-10">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="text-xs font-semibold tracking-wider uppercase text-muted hover:text-red transition-colors inline-block mb-8"
      >
        ‹ Back to roster
      </Link>

      {/* Header */}
      <header className="mb-10">
        <p className="text-[11px] font-semibold text-red tracking-[0.2em] uppercase mb-3 pt-2 border-t-2 border-red inline-block">
          Client
        </p>
        <h1 className="font-display font-extrabold text-blue text-4xl uppercase tracking-tight leading-none mb-2">
          {client.name}
        </h1>
        <p className="text-body text-sm">
          {client.goal?.replace(/_/g, ' ') || 'No goal set'} · Status: {client.status || 'active'}
        </p>
      </header>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column */}
        <div className="col-span-1 space-y-4">

          <Card title="Journey">
            <StatRow label="Start weight"  value={client.start_weight   ? `${client.start_weight}kg`   : '—'} />
            <StatRow label="Current"        value={currentWeight ? `${currentWeight}kg` : '—'} />
            <StatRow label="Target"         value={client.target_weight  ? `${client.target_weight}kg`  : '—'} />
            <div className="h-px bg-border my-3" />
            {lost !== null && lost >= 0 && (
              <StatRow label="Lost" value={`${lost}kg`} valueClass="text-red font-bold" />
            )}
            {lost !== null && lost < 0 && (
              <StatRow label="Gained" value={`${Math.abs(lost)}kg`} valueClass="text-blue font-bold" />
            )}
            {toGo !== null && toGo > 0 && (
              <StatRow label="To go" value={`${toGo}kg`} valueClass="text-blue font-bold" />
            )}
            {toGo !== null && toGo <= 0 && (
              <StatRow label="Past target by" value={`${Math.abs(toGo)}kg`} valueClass="text-green-700 font-bold" />
            )}
            {lastWeigh && (
              <p className="text-[10px] text-muted mt-3 tracking-wide">
                Last weigh-in: {timeAgo(lastWeigh.created_at)}
              </p>
            )}
          </Card>

          <Card title="Today's signals">
            {latest ? (
              <>
                <StatRow label="Steps"    value={(latest.steps || 0).toLocaleString()} />
                <StatRow label="Calories" value={latest.calories ?? '—'} />
                <StatRow label="Protein"  value={latest.protein ? `${latest.protein}g` : '—'} />
              </>
            ) : (
              <p className="text-muted text-xs">No health data logged today</p>
            )}
          </Card>

          <Card title="Pact streak (last 14 days)">
            {pacts.length === 0 ? (
              <p className="text-muted text-xs">No pacts logged in this window</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {pacts.slice().reverse().map(p => (
                  <div
                    key={p.date}
                    title={`${p.date}: ${p.wins_completed ?? 0}/${p.total_wins ?? 0} wins`}
                    className={`w-5 h-5 rounded-sm ${
                      p.status === 'won'    ? 'bg-green-500'
                      : p.status === 'partial' ? 'bg-amber-400'
                      : p.status === 'lost'    ? 'bg-red'
                                                : 'bg-border'
                    }`}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Centre + right */}
        <div className="col-span-2 space-y-4">

          <Card title={`Slips in last 14 days (${slips.length})`}>
            {slips.length === 0 ? (
              <p className="text-muted text-xs">No slip events.</p>
            ) : (
              <ul className="divide-y divide-border">
                {slips.map((s, i) => (
                  <li key={i} className="py-2.5 first:pt-0 last:pb-0 flex justify-between items-center text-sm">
                    <span className="text-blue font-medium">{s.event_type.replace(/_/g, ' ')}</span>
                    <span className="text-muted text-xs">{timeAgo(s.detected_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent conversation">
            {messages.length === 0 ? (
              <p className="text-muted text-xs">No messages yet.</p>
            ) : (
              <div className="flex flex-col gap-2.5 max-h-[600px] overflow-y-auto scroll-thin pr-1">
                {messages.slice().reverse().map((m, i) => {
                  const isUser = m.role === 'user';
                  return (
                    <div
                      key={i}
                      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] px-3.5 py-2.5 rounded-md text-sm leading-relaxed ${
                          isUser
                            ? 'bg-red text-white rounded-br-sm'
                            : 'bg-bg-alt text-blue rounded-bl-sm'
                        }`}
                      >
                        <div className={`text-[10px] font-semibold tracking-wider uppercase mb-1 ${
                          isUser ? 'text-white/70' : 'text-muted'
                        }`}>
                          {isUser ? firstName : 'PAX'} · {timeAgo(m.created_at)}
                        </div>
                        <div className="whitespace-pre-wrap">{m.content}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-white rounded-lg shadow-card border border-border p-5">
      <h3 className="font-display font-bold text-blue text-[11px] uppercase tracking-[0.15em] mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatRow({ label, value, valueClass = 'text-blue' }) {
  return (
    <div className="flex justify-between items-baseline py-1.5">
      <span className="text-muted text-xs">{label}</span>
      <span className={`font-display text-sm tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}
