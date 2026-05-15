export interface User {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  avatar_url: string | null;
}

export interface NoteImage {
  id: string;
  url: string;
  filename: string;
  size_bytes: number;
}

export interface NoteAttachment {
  id: string;
  url: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Note {
  id: string;
  name: string;
  content: string;
  order: number;
  pinned: boolean;
  way_id: string | null;
  topic_id: string | null;
  topic_inline_id: string | null;
  tags: Tag[];
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: string;
  way_id: string;
  name: string;
  order: number;
  notes: Note[];
  inline_note: Note | null;
  created_at: string;
  updated_at: string;
}

export interface Way {
  id: string;
  name: string;
  order: number;
  topics: Topic[];
  notes: Note[];
  created_at: string;
  updated_at: string;
}

// Goal statuses (legacy names todo/in_progress/background still accepted by backend
// but normalized; on the frontend we always use the new names).
export type TaskStatus = 'backlog' | 'active' | 'paused' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export type GoKind = 'boolean' | 'numeric';
export type GoRecurrence = 'none' | 'daily' | 'weekly';

export interface GoEntry {
  id: string;
  go_id: string;
  date: string;       // YYYY-MM-DD
  value: number;
}

export interface Go {
  id: string;
  user_id: string;
  task_id: string | null;
  step_id: string | null;
  title: string;
  description: string;
  kind: GoKind;
  unit: string;
  target_value: number | null;
  recurrence: GoRecurrence;
  start_date: string | null;
  due_date: string | null;
  color: string;
  entries: GoEntry[];
  task_title: string | null;
  total_value: number;
  is_done_today: boolean;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Step — milestone phase inside a Goal. Goal → Step → Go.
// ═══════════════════════════════════════════════════════════════════════════

export type StepStatus = 'not_started' | 'in_progress' | 'done';

export interface Step {
  id: string;
  user_id: string;
  goal_id: string;
  title: string;
  description: string;
  position: number;
  status: StepStatus;
  start_date: string | null;
  end_date: string | null;
  completed_at: string | null;
  /** Total non-routine Gos attached to this Step. */
  gos_count: number;
  /** Subset of gos_count that count as "done today". */
  gos_done: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  start_date: string | null;
  due_date: string | null;
  is_completed: boolean;
  order: number;
  color: string;
  gos: Go[];
  tags: Tag[];
  routines: GoalRoutineLink[];
  steps: Step[];
  progress: number;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Routine — recurring activity (replaces old daily/weekly Go)
// ═══════════════════════════════════════════════════════════════════════════

export type RoutineScheduleType = 'daily' | 'weekly_on_days' | 'every_n_days' | 'times_per_week';

export interface RoutineEntry {
  id: string;
  routine_id: string;
  date: string;
  value: number;
}

export interface Routine {
  id: string;
  user_id: string;
  goal_id: string | null;
  title: string;
  description: string;
  color: string;
  schedule_type: RoutineScheduleType;
  schedule_days: string;        // CSV "0,2,4" for Mon/Wed/Fri (0=Sun..6=Sat)
  schedule_n_days: number;
  schedule_count_per_period: number;
  schedule_period: 'week' | 'month';
  start_date: string | null;
  end_date: string | null;
  is_paused: boolean;
  kind: 'boolean' | 'numeric';
  unit: string;
  target_value: number | null;
  entries: RoutineEntry[];
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// GoalRoutineLink — Goal ↔ Routine join with bounded period
// ═══════════════════════════════════════════════════════════════════════════

export interface GoalRoutineLink {
  id: string;
  goal_id: string;
  routine_id: string;
  start_date: string;       // ISO date
  end_date: string | null;
  target_count: number | null;
  routine: Routine;          // hydrated
}


// ═══════════════════════════════════════════════════════════════════════════
// Sprint — temporal focus collection (backend model: FocusSprint, NOT a Step inside Goal)
// API endpoints: /api/focus-sprints/*
// ═══════════════════════════════════════════════════════════════════════════

export type SprintItemType = 'goal' | 'go' | 'routine';

export interface SprintItem {
  id: string;
  item_type: SprintItemType;
  goal_id: string | null;
  go_id: string | null;
  routine_id: string | null;
  // Hydrated by backend
  title: string | null;
  color: string | null;
}

export interface Sprint {
  id: string;
  user_id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  color: string;
  is_archived: boolean;
  items: SprintItem[];
  created_at: string;
  updated_at: string;
}

// ── AI ────────────────────────────────────────────────────────────────────────
// Generic job lifecycle mirrors AIJobOut in backend.

export type AIJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type AIJobKind = 'quiz' | 'tasks_extract' | 'schedule' | 'insights';

export interface AIJob {
  id: string;
  kind: AIJobKind;
  status: AIJobStatus;
  input_json: Record<string, unknown>;
  output_json: Record<string, unknown> | null;
  error: string | null;
  eta_seconds: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

// Quiz output (output_json for kind='quiz' jobs).
export interface QuizJobOutput {
  quiz_id: string;
  total_questions: number;
  title: string;
}

export interface QuizOptions { A: string; B: string; C: string; D: string }
export type QuizLetter = 'A' | 'B' | 'C' | 'D';

export interface QuizQuestion {
  question: string;
  options: QuizOptions;
  correct: QuizLetter;
  explanation: string;
  source_quote: string | null;
  source_note_id: string | null;
  source_note_title: string | null;
}

export interface AIQuiz {
  id: string;
  title: string;
  scope_kind: 'note' | 'topic' | 'way' | 'tag' | 'multi' | 'recent';
  scope_ref: Record<string, unknown>;
  difficulty: 'easy' | 'medium' | 'hard';
  questions: QuizQuestion[];
  created_at: string;
}

export interface QuizAttemptAnswer {
  question_idx: number;
  selected: QuizLetter;
}

export interface QuizAttemptItem {
  question_idx: number;
  selected: QuizLetter;
  correct: boolean;
  correct_answer: QuizLetter;
  explanation: string;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  score: number;
  total: number;
  items: QuizAttemptItem[];
  next_review_at: string | null;
  completed_at: string | null;
}

export interface QuizScope {
  kind: 'note' | 'topic' | 'way' | 'tag' | 'multi' | 'recent';
  id?: string;
  ids?: string[];
  days?: number;
}

export interface QuizCreate {
  scope: QuizScope;
  difficulty?: 'easy' | 'medium' | 'hard';
  count?: number;
}

// Tasks extraction
export interface TaskExtractItem {
  title: string;
  quote: string;
}

export interface TasksExtractOutput {
  items: TaskExtractItem[];
  source_note_id: string;
  source_note_title: string;
}

export interface TasksExtractCreate {
  scope: { kind: 'note'; id: string };
}

export interface TasksCommitInput {
  job_id: string;
  picked: number[];
  task_id?: string | null;   // Goal (legacy naming)
  step_id?: string | null;
}

export interface TasksCommitOutput {
  created_count: number;
  created_ids: string[];
}

// Schedule (Plan day)
export interface ScheduleHours {
  start_h: number;
  end_h: number;
}

export interface ScheduleCreate {
  /** ISO YYYY-MM-DD; empty = server uses today. */
  date?: string;
  hours?: ScheduleHours;
  prefs?: string[];
  /** Default true: HH:MM slot times. false → free-ordered priority list. */
  time_blocked?: boolean;
}

export type ScheduleSlotKind = 'goal' | 'routine' | 'admin' | 'break' | 'lunch' | 'deep_work' | 'other';

export interface ScheduleSlot {
  start_time: string;  // HH:MM
  end_time: string;
  kind: ScheduleSlotKind;
  title: string;
  source_kind: 'go' | 'task' | 'routine' | null;
  source_id: string | null;
  note: string;
}

export interface ScheduleSummary {
  /** What to prioritise today. */
  focus: string;
  /** Where the user is on/ahead of track. */
  doing_well: string;
  /** Stale work, overdue items, falling-behind areas. */
  needs_attention: string;
}

export interface ScheduleOutput {
  date: string;
  summary: ScheduleSummary;
  slots: ScheduleSlot[];
  total_active_minutes: number;
}

// Weekly insights
export interface InsightsCreate {
  /** Days back from today. 7/30/90/365. Default 7. */
  range_days?: number;
  /** Legacy: explicit Monday anchor. Overrides range_days if set. */
  week_start?: string;
}

export interface InsightsSummary {
  doing_well: string;
  needs_attention: string;
  focus: string;
}

export interface InsightsMetrics {
  gos_created: number;
  gos_closed: number;
  notes_created: number;
  overdue_count: number;
  active_goals: number;
}

export interface InsightsOutput {
  week_start: string;
  week_end: string;
  summary: InsightsSummary;
  metrics: InsightsMetrics;
}
