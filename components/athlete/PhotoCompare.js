/**
 * Progress photos the athlete added to their weekly check-ins, seen by the
 * coach only. Start vs latest of the same pose side by side (front first),
 * then every week by pose. URLs are signed by the engine for 10 minutes,
 * so a reload fetches fresh ones; nothing here is ever sent to an AI.
 *
 * weeks: [{ weekStart, front: { url, date } | null, side, back }] newest first
 */
import s from './overview.module.css';

const POSES = ['front', 'side', 'back'];
const LABEL = { front: 'Front', side: 'Side', back: 'Back' };

const short = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** The pose to compare: front when they have one, else the pose with the most weeks. */
export function comparePose(weeks) {
  const count = (p) => weeks.filter((w) => w[p]).length;
  if (count('front')) return 'front';
  let best = null;
  for (const p of POSES) if (count(p) > (best ? count(best) : 0)) best = p;
  return best;
}

function Frame({ photo, caption, placeholder, height = 220 }) {
  return (
    <figure style={{ margin: 0, flex: 1, minWidth: 0, height, position: 'relative', background: '#EEF2F6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.url} alt={caption} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <span style={{ font: '600 13px Inter, sans-serif', color: '#5B6B7F', padding: 12, textAlign: 'center' }}>{placeholder}</span>
      )}
      <figcaption style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '4px 6px', font: '600 11px Inter, sans-serif', color: '#FFFFFF', background: 'rgba(10,37,64,.75)' }}>{caption}</figcaption>
    </figure>
  );
}

export default function PhotoCompare({ weeks, firstName }) {
  if (!weeks) return null;
  const pose = weeks.length ? comparePose(weeks) : null;
  const withPose = pose ? weeks.filter((w) => w[pose]) : [];
  const latest = withPose[0] || null;
  const start = withPose[withPose.length - 1] || null;
  const twoPoints = start && latest && start.weekStart !== latest.weekStart;

  return (
    <section className={s.card} aria-labelledby="ov-photos" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="flex justify-between items-baseline gap-2 flex-wrap">
        <h2 id="ov-photos" className={s.h} style={{ fontSize: 15 }}>Progress photos</h2>
        <p className={s.lbl}>Only you see these</p>
      </div>

      {!pose ? (
        <p className="m-0 text-[14px] text-[#5B6B7F]">
          No photos yet. {firstName} can add front, side and back to each weekly check-in in the app. They stay between the two of you.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <Frame photo={start[pose]} caption={`Start · ${short(start[pose].date)}`} />
            <Frame photo={twoPoints ? latest[pose] : null} caption={twoPoints ? `Latest · ${short(latest[pose].date)}` : 'Latest'} placeholder="Their next check-in photo goes here" />
          </div>
          <p className="m-0 text-[12px] text-[#5B6B7F]">{LABEL[pose]} view, earliest and most recent check-in with that pose.</p>

          {weeks.length > 0 && (
            <div style={{ borderTop: '1px solid #EEF1F5', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {weeks.map((w) => (
                <div key={w.weekStart} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ font: '600 12px Inter, sans-serif', color: '#5B6B7F', width: 92, flex: 'none' }}>Week of {short(w.weekStart)}</span>
                  <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 0 }}>
                    {POSES.map((p) => (
                      <Frame key={p} photo={w[p]} caption={LABEL[p]} placeholder="—" height={88} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
