import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Clock, Target, Sparkles } from 'lucide-react';
import { aiApi } from '../../../api/client';
import type {
  AIJob,
  AIJobKind,
  AIQuiz,
  GoalPlanOutput,
  ScheduleOutput,
  SprintPlanOutput,
  InsightsOutput,
  CoachOutput,
} from '../../../api/types';
import { MobileBottomSheet } from './MobileBottomSheet';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string | null;
}

const KIND_TITLE: Record<AIJobKind, string> = {
  quiz:        'AI quiz',
  schedule:    'Plan for today',
  insights:    'Weekly insights',
  sprint_plan: 'Sprint proposal',
  coach:       'Coach',
  goal_plan:   'Goal plan',
};

/**
 * Generic mobile viewer for completed AI jobs. Polls the job by id,
 * renders the result with a kind-specific layout for `schedule`,
 * `sprint_plan`, `insights`, `coach`, and falls back to a pretty JSON
 * dump for anything else. Mounted at App level so it works regardless
 * of which tab the user is on when they tap a "ready" toast/panel row.
 *
 * Kinds with bespoke flows (goal_plan → MobileGoalPlanSheet, quiz when
 * a note editor is open → MobileQuizSheet) are skipped by the parent
 * router so they don't double-open.
 */
export function MobileAIResultSheet({ open, onOpenChange, jobId }: Props) {
  const [job, setJob] = useState<AIJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll the job until terminal so a still-running tap doesn't show empty.
  useEffect(() => {
    if (!open || !jobId) {
      setJob(null);
      setError(null);
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    setLoading(true);
    const tick = async () => {
      try {
        const j = await aiApi.getJob(jobId);
        if (cancelled) return;
        setJob(j);
        setLoading(false);
        if (j.status === 'queued' || j.status === 'running') {
          timer = window.setTimeout(tick, 2000);
        }
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.detail ?? e?.message ?? 'Failed to load job');
        setLoading(false);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, jobId]);

  const title = job ? (KIND_TITLE[job.kind] ?? 'AI result') : 'AI result';

  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange} title={title}>
      {loading && !job && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 28, color: 'var(--ink-4)' }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      )}
      {error && (
        <div className="m-ai-empty" style={{ color: 'var(--rust)' }}>{error}</div>
      )}
      {job && (job.status === 'queued' || job.status === 'running') && (
        <div className="m-ai-result-pending">
          <Loader2 size={18} className="animate-spin" />
          <span>{job.status === 'queued' ? 'Queued…' : 'Generating…'}</span>
        </div>
      )}
      {job && job.status === 'failed' && (
        <div className="m-ai-empty" style={{ color: 'var(--rust)' }}>
          <AlertTriangle size={16} style={{ marginRight: 6 }} />
          {job.error || 'Generation failed'}
        </div>
      )}
      {job && job.status === 'cancelled' && (
        <div className="m-ai-empty">Cancelled.</div>
      )}
      {job && job.status === 'done' && <ResultBody job={job} />}
    </MobileBottomSheet>
  );
}

function ResultBody({ job }: { job: AIJob }) {
  const out = job.output_json as unknown;
  if (!out) return <div className="m-ai-empty">No output.</div>;
  if (job.kind === 'schedule')    return <ScheduleView   out={out as ScheduleOutput} />;
  if (job.kind === 'sprint_plan') return <SprintPlanView out={out as SprintPlanOutput} />;
  if (job.kind === 'insights')    return <InsightsView   out={out as InsightsOutput} />;
  if (job.kind === 'coach')       return <CoachView      out={out as CoachOutput} />;
  if (job.kind === 'quiz')        return <QuizView       out={out as AIQuiz} />;
  if (job.kind === 'goal_plan')   return <GoalPlanView   out={out as GoalPlanOutput} />;
  return <JsonFallback out={out} />;
}

// ── kind-specific renderers ──────────────────────────────────────────────────

function ScheduleView({ out }: { out: ScheduleOutput }) {
  return (
    <div className="m-ai-result">
      <div className="m-ai-result-date">{fmtDate(out.date)} · {Math.round(out.total_active_minutes / 60 * 10) / 10}h planned</div>
      {out.summary?.focus && (
        <SummaryRow label="Focus" value={out.summary.focus} accent="indigo" />
      )}
      {out.summary?.doing_well && (
        <SummaryRow label="Doing well" value={out.summary.doing_well} accent="moss" />
      )}
      {out.summary?.needs_attention && (
        <SummaryRow label="Needs attention" value={out.summary.needs_attention} accent="rust" />
      )}
      <div className="m-ai-slots">
        {out.slots.map((s, i) => (
          <div key={i} className="m-ai-slot" data-kind={s.kind}>
            <div className="m-ai-slot-time">
              <Clock size={11} /> {s.start_time}–{s.end_time}
            </div>
            <div className="m-ai-slot-title">{s.title}</div>
            {s.note && <div className="m-ai-slot-note">{s.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SprintPlanView({ out }: { out: SprintPlanOutput }) {
  return (
    <div className="m-ai-result">
      <div className="m-ai-result-title">{out.title}</div>
      <div className="m-ai-result-date">
        {fmtDate(out.start_date)} → {fmtDate(out.end_date)}
      </div>
      {out.description && <p className="m-ai-result-lede">{out.description}</p>}
      {out.rationale && (
        <SummaryRow label="Rationale" value={out.rationale} accent="indigo" />
      )}
      <div className="m-ai-result-section-title">
        <Target size={12} /> {out.items.length} item{out.items.length === 1 ? '' : 's'}
      </div>
      <div className="m-ai-items">
        {out.items.map((it) => (
          <div key={`${it.kind}-${it.id}`} className="m-ai-item">
            <span className="m-ai-item-kind">{it.kind}</span>
            <div className="m-ai-item-body">
              <div className="m-ai-item-title">{it.title}</div>
              {it.reason && <div className="m-ai-item-reason">{it.reason}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightsView({ out }: { out: InsightsOutput }) {
  return (
    <div className="m-ai-result">
      <div className="m-ai-result-date">
        {fmtDate(out.week_start)} → {fmtDate(out.week_end)}
      </div>
      <SummaryRow label="Focus" value={out.summary.focus} accent="indigo" />
      <SummaryRow label="Doing well" value={out.summary.doing_well} accent="moss" />
      <SummaryRow label="Needs attention" value={out.summary.needs_attention} accent="rust" />
      <div className="m-ai-metrics">
        <Metric n={out.metrics.gos_created}   lab="Gos created" />
        <Metric n={out.metrics.gos_closed}    lab="Gos closed" />
        <Metric n={out.metrics.notes_created} lab="Notes" />
        <Metric n={out.metrics.overdue_count} lab="Overdue" />
        <Metric n={out.metrics.active_goals}  lab="Active goals" />
      </div>
    </div>
  );
}

function CoachView({ out }: { out: CoachOutput }) {
  return (
    <div className="m-ai-result">
      <div className="m-ai-result-date">
        {fmtDate(out.period_start)} → {fmtDate(out.period_end)}
      </div>
      <div className="m-ai-coach-play">
        <div className="m-ai-result-section-title">
          <Sparkles size={12} /> One play
        </div>
        <div className="m-ai-coach-play-title">{out.one_play.what}</div>
        {out.one_play.why && (
          <div className="m-ai-coach-play-why">{out.one_play.why}</div>
        )}
        <div className="m-ai-coach-play-est">~{out.one_play.est_minutes}m</div>
      </div>
      {out.at_risk.length > 0 && (
        <>
          <div className="m-ai-result-section-title">
            <AlertTriangle size={12} /> At risk · {out.at_risk.length}
          </div>
          <div className="m-ai-items">
            {out.at_risk.map((r, i) => (
              <div key={i} className="m-ai-item" data-severity={r.severity}>
                <span className="m-ai-item-kind">{r.severity}</span>
                <div className="m-ai-item-body">
                  <div className="m-ai-item-title">{r.what}</div>
                  <div className="m-ai-item-reason">{r.when_label}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {out.if_then && (
        <SummaryRow
          label="If / then"
          value={`${out.if_then.trigger} → ${out.if_then.action}`}
          accent="ochre"
        />
      )}
      <div className="m-ai-capacity">
        <div>Due: <b>{out.capacity.due_count}</b></div>
        <div>Throughput: <b>{out.capacity.throughput_per_week}/wk</b></div>
        <div>Gap: <b>{out.capacity.gap}</b></div>
        {out.capacity.note && <div className="m-ai-slot-note">{out.capacity.note}</div>}
      </div>
      {out.hidden_lever && (
        <SummaryRow
          label="Hidden lever"
          value={`${out.hidden_lever.what} — ${out.hidden_lever.why}`}
          accent="moss"
        />
      )}
    </div>
  );
}

function QuizView({ out }: { out: AIQuiz }) {
  return (
    <div className="m-ai-result">
      <div className="m-ai-result-title">{out.title}</div>
      <div className="m-ai-result-date">
        {out.questions.length} question{out.questions.length === 1 ? '' : 's'} · {out.difficulty}
      </div>
      <div className="m-ai-quiz-list">
        {out.questions.map((q, i) => (
          <div key={i} className="m-ai-quiz-q">
            <div className="m-ai-quiz-q-text">
              <span className="m-ai-quiz-q-num">{i + 1}.</span> {q.question}
            </div>
            <div className="m-ai-quiz-opts">
              {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                const isCorrect = q.correct === letter;
                return (
                  <div
                    key={letter}
                    className="m-ai-quiz-opt"
                    data-correct={isCorrect || undefined}
                  >
                    <span className="m-ai-quiz-opt-letter">{letter}</span>
                    <span className="m-ai-quiz-opt-text">{q.options[letter]}</span>
                  </div>
                );
              })}
            </div>
            {q.explanation && (
              <div className="m-ai-quiz-expl">{q.explanation}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GoalPlanView({ out }: { out: GoalPlanOutput }) {
  return (
    <div className="m-ai-result">
      <div className="m-ai-result-title">{out.goal_title}</div>
      <div className="m-ai-result-date">
        {out.mode.replace('_', ' ')} · {out.steps.length} step{out.steps.length === 1 ? '' : 's'}
      </div>
      {out.rationale && (
        <SummaryRow label="Rationale" value={out.rationale} accent="indigo" />
      )}
      <div className="m-ai-items">
        {out.steps.map((s, i) => (
          <div key={i} className="m-ai-item" data-severity="step">
            <span className="m-ai-item-kind">Step</span>
            <div className="m-ai-item-body">
              <div className="m-ai-item-title">{s.title}</div>
              {(s.start_date || s.end_date) && (
                <div className="m-ai-item-reason">
                  {fmtDate(s.start_date)} → {fmtDate(s.end_date)}
                </div>
              )}
              {s.description && (
                <div className="m-ai-item-reason">{s.description}</div>
              )}
              {s.gos.length > 0 && (
                <div className="m-ai-quiz-expl">
                  {s.gos.map((g, gi) => (
                    <div key={gi}>• {g.title}{g.due_date ? ` (${fmtDate(g.due_date)})` : ''}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {out.orphan_gos.length > 0 && (
          <>
            <div className="m-ai-result-section-title">
              Orphan gos · {out.orphan_gos.length}
            </div>
            {out.orphan_gos.map((g, gi) => (
              <div key={gi} className="m-ai-item">
                <span className="m-ai-item-kind">Go</span>
                <div className="m-ai-item-body">
                  <div className="m-ai-item-title">{g.title}</div>
                  {g.due_date && (
                    <div className="m-ai-item-reason">{fmtDate(g.due_date)}</div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function JsonFallback({ out }: { out: unknown }) {
  return (
    <pre style={{
      fontFamily: 'var(--font-mono)', fontSize: 11,
      background: 'var(--cream)', borderRadius: 8, padding: 12,
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      color: 'var(--ink-2)', margin: 0,
    }}>{JSON.stringify(out, null, 2)}</pre>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────

function SummaryRow({ label, value, accent }: {
  label: string; value: string; accent: 'indigo' | 'moss' | 'ochre' | 'rust';
}) {
  return (
    <div className="m-ai-summary-row" data-accent={accent}>
      <div className="m-ai-summary-label">{label}</div>
      <div className="m-ai-summary-value">{value}</div>
    </div>
  );
}

function Metric({ n, lab }: { n: number; lab: string }) {
  return (
    <div className="m-ai-metric">
      <div className="m-ai-metric-num">{n}</div>
      <div className="m-ai-metric-lab">{lab}</div>
    </div>
  );
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
