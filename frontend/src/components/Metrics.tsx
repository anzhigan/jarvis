import { useEffect, useMemo, useState } from 'react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, TrendingUp, Target, Loader2, X, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { metricsApi } from '../api/client';
import type { Metric, MetricEntry } from '../api/types';

const COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

function MetricCard({
  metric,
  onDelete,
  onAddEntry,
  onDeleteEntry,
}: {
  metric: Metric;
  onDelete: () => void;
  onAddEntry: (value: number, date: string) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
}) {
  const [showEntry, setShowEntry] = useState(false);
  const [entryValue, setEntryValue] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  const data = useMemo(() => {
    return [...metric.entries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({
        date: new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        rawDate: e.date,
        id: e.id,
        value: e.value,
      }));
  }, [metric.entries]);

  const total = metric.entries.reduce((s, e) => s + e.value, 0);
  const avg = metric.entries.length ? total / metric.entries.length : 0;
  const latest = data[data.length - 1]?.value ?? 0;
  const progress = metric.target_value ? Math.min(100, (total / metric.target_value) * 100) : null;

  const submit = async () => {
    const val = parseFloat(entryValue);
    if (isNaN(val)) return;
    setSaving(true);
    try {
      await onAddEntry(val, entryDate);
      setEntryValue('');
      setShowEntry(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${metric.color}15`, color: metric.color }}
          >
            <TrendingUp size={16} />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{metric.name}</h3>
            {metric.unit && (
              <p className="text-xs text-muted-foreground">{metric.unit}</p>
            )}
          </div>
        </div>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <div className="text-xs text-muted-foreground">Latest</div>
          <div className="text-xl font-semibold">{latest}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Average</div>
          <div className="text-xl font-semibold">{avg.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-xl font-semibold">{total.toFixed(1)}</div>
        </div>
      </div>

      {progress !== null && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Target size={11} />
              Target {metric.target_value}
            </span>
            <span className="font-medium">{progress.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full transition-all"
              style={{ width: `${progress}%`, backgroundColor: metric.color }}
            />
          </div>
        </div>
      )}

      {data.length > 0 ? (
        <div className="h-32 -mx-2 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={28} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                  fontSize: '12px',
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={metric.color}
                strokeWidth={2}
                dot={{ r: 3, fill: metric.color }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-32 flex items-center justify-center text-xs text-muted-foreground mb-3 border border-dashed border-border rounded-lg">
          No data yet
        </div>
      )}

      {/* Entries list */}
      {metric.entries.length > 0 && (
        <div className="max-h-24 overflow-y-auto mb-3 text-xs">
          {[...metric.entries]
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 5)
            .map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between py-1 px-2 rounded group hover:bg-muted"
              >
                <span className="text-muted-foreground">
                  {new Date(e.date).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {e.value}
                    {metric.unit && <span className="text-muted-foreground"> {metric.unit}</span>}
                  </span>
                  <button
                    onClick={() => onDeleteEntry(e.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Add entry */}
      {showEntry ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="any"
            placeholder="Value"
            value={entryValue}
            onChange={(e) => setEntryValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="flex-1 h-8 px-2.5 text-xs bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
            autoFocus
          />
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="h-8 px-2 text-xs bg-input-background border border-border rounded-md"
          />
          <button
            onClick={submit}
            disabled={saving || !entryValue}
            className="h-8 px-3 bg-primary text-primary-foreground rounded-md text-xs font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : 'Add'}
          </button>
          <button
            onClick={() => setShowEntry(false)}
            className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowEntry(true)}
          className="w-full h-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md hover:border-border-strong transition-colors"
        >
          <Plus size={12} />
          Log entry
        </button>
      )}
    </div>
  );
}

export default function Metrics() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState('');
  const [color, setColor] = useState(COLORS[0]);

  const load = async () => {
    try {
      const data = await metricsApi.list();
      setMetrics(data);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await metricsApi.create({
        name: name.trim(),
        unit: unit.trim(),
        target_value: target ? parseFloat(target) : null,
        color,
      });
      setName('');
      setUnit('');
      setTarget('');
      setColor(COLORS[0]);
      setShowForm(false);
      await load();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const deleteMetric = async (id: string) => {
    if (!confirm('Delete this metric and all its entries?')) return;
    try {
      await metricsApi.delete(id);
      await load();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to delete');
    }
  };

  const addEntry = async (metricId: string, value: number, date: string) => {
    try {
      await metricsApi.addEntry(metricId, value, date);
      await load();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to add entry');
    }
  };

  const deleteEntry = async (metricId: string, entryId: string) => {
    try {
      await metricsApi.deleteEntry(metricId, entryId);
      await load();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to delete');
    }
  };

  if (loading) {
    return (
      <div className="size-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="size-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Metrics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track what matters — {metrics.length} metric{metrics.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <Plus size={15} />
            New metric
          </button>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="overflow-hidden"
            >
              <div className="p-5 bg-card border border-border rounded-lg space-y-3">
                <input
                  type="text"
                  placeholder="Metric name (e.g. Running, Reading)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Unit (km, pages, hours)"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="h-10 px-3 rounded-lg border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="Target (optional)"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="h-10 px-3 rounded-lg border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                  />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">Color</div>
                  <div className="flex gap-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={`w-7 h-7 rounded-md transition-all ${color === c ? 'ring-2 ring-offset-2 ring-ring' : ''}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowForm(false)}
                    className="h-9 px-3.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={create}
                    disabled={creating || !name.trim()}
                    className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {creating && <Loader2 size={13} className="animate-spin" />}
                    Create
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {metrics.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl py-16 text-center">
            <BarChart3 size={28} className="mx-auto mb-3 text-muted-foreground opacity-60" />
            <p className="text-sm text-muted-foreground">
              No metrics yet. Click "New metric" to create one.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metrics.map((m) => (
              <MetricCard
                key={m.id}
                metric={m}
                onDelete={() => deleteMetric(m.id)}
                onAddEntry={(value, date) => addEntry(m.id, value, date)}
                onDeleteEntry={(eid) => deleteEntry(m.id, eid)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
