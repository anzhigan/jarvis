import type {
  Note,
  NoteAttachment,
  NoteImage,
  Tag,
  Task,
  TaskPriority,
  TaskStatus,
  Go,
  GoEntry,
  GoKind,
  GoRecurrence,
  GoalRoutineLink,
  Topic,
  User,
  Way,
} from './types';

// API base URL. No env var → relative /api/v1 proxied by nginx. VITE_API_URL overrides for dev.
const BASE_URL: string = import.meta.env.VITE_API_URL || '/api/v1';

/** Strip the API prefix (/api or /api/v1) from BASE_URL when it's absolute,
 *  to recover the bare origin for asset URL resolution. */
function originOf(base: string): string {
  return base.replace(/\/api(?:\/v\d+)?\/?$/, '');
}

// Auth-protected asset paths served by the backend.
//   /api/images/      — referenced from <img src=…> — token MUST be in the URL
//                       at render time (img can't send Authorization headers),
//                       so we inject the token into HTML on load.
//   /api/attachments/ — referenced from <a href=…> in the FileAttachment node
//                       — token is appended just-in-time by resolveUrl() at
//                       click time, so the freshest access_token is used and
//                       stale tokens never linger in the DOM.
const ASSET_PATH_RE = /\/api(?:\/v\d+)?\/(?:images|attachments)\//;
const IMAGE_URL_RE  = /(\/api(?:\/v\d+)?\/images\/[^"'\s?]+)(\?[^"'\s]*)?/g;

export function resolveUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  let resolved = url;
  if (BASE_URL.startsWith('http')) {
    const origin = originOf(BASE_URL);
    resolved = url.startsWith('/') ? `${origin}${url}` : `${origin}/${url}`;
  }
  if (ASSET_PATH_RE.test(resolved)) {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (token && !resolved.includes('token=')) {
      resolved += (resolved.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
    }
  }
  return resolved;
}

/** Strip ?token=… from saved HTML before persisting. Covers both /api/images/
 *  (in case a token leaked in there) and /api/attachments/ (which is meant to
 *  stay bare — token is JIT-applied at render). */
export function stripImageToken(html: string): string {
  return html.replace(
    /(\/api(?:\/v\d+)?\/(?:images|attachments)\/[^"'\s?]+)\?token=[^"'\s&]+(&[^"'\s]*)?/g,
    '$1$2',
  );
}

/** Append ?token=… to /api/images/… URLs in HTML before rendering. Attachments
 *  are deliberately NOT touched here — their NodeView resolves the URL through
 *  resolveUrl() at click time, which always reads the latest access_token. */
export function injectImageToken(html: string): string {
  if (typeof localStorage === 'undefined') return html;
  const token = localStorage.getItem('access_token');
  if (!token) return html;
  const enc = encodeURIComponent(token);
  return html.replace(IMAGE_URL_RE, (_m, path, query) => {
    if (query && query.includes('token=')) return path + query;
    if (query) return `${path}${query}&token=${enc}`;
    return `${path}?token=${enc}`;
  });
}

export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  const refresh_token = localStorage.getItem('refresh_token');
  if (!refresh_token) return false;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = localStorage.getItem('access_token');
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (!(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401 && retry) {
    const ok = await tryRefresh();
    if (ok) return request<T>(path, init, false);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, err.detail ?? 'Unknown error');
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (email: string, username: string, password: string) =>
    request<User>('/auth/register', { method: 'POST', body: JSON.stringify({ email, username, password }) }),
  login: async (email: string, password: string) => {
    const data = await request<{ access_token: string; refresh_token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data;
  },
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },
  me: () => request<User>('/auth/me'),
  updateProfile: (data: { username?: string; email?: string }) =>
    request<User>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  changePassword: (current_password: string, new_password: string) =>
    request<void>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),
  deleteAccount: () => request<void>('/auth/me', { method: 'DELETE' }),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<User>('/auth/me/avatar', { method: 'POST', body: form });
  },
  deleteAvatar: () => request<User>('/auth/me/avatar', { method: 'DELETE' }),
};

// ── Ways / Topics / Notes (unchanged) ─────────────────────────────────────────
export const waysApi = {
  list: () => request<Way[]>('/ways'),
  create: (name: string, order = 0) =>
    request<Way>('/ways', { method: 'POST', body: JSON.stringify({ name, order }) }),
  update: (id: string, data: { name?: string; order?: number }) =>
    request<Way>(`/ways/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/ways/${id}`, { method: 'DELETE' }),
};

export const topicsApi = {
  create: (wayId: string, name: string, order = 0) =>
    request<Topic>(`/ways/${wayId}/topics`, { method: 'POST', body: JSON.stringify({ name, order }) }),
  update: (id: string, data: { name?: string; order?: number }) =>
    request<Topic>(`/topics/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/topics/${id}`, { method: 'DELETE' }),
};

export const notesApi = {
  create: (data: { name: string; content?: string; way_id?: string; topic_id?: string; topic_inline_id?: string }) =>
    request<Note>('/notes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; content?: string; pinned?: boolean }) =>
    request<Note>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  move: (id: string, target: { way_id?: string; topic_id?: string }) =>
    request<Note>(`/notes/${id}/move`, { method: 'POST', body: JSON.stringify(target) }),
  delete: (id: string) => request<void>(`/notes/${id}`, { method: 'DELETE' }),
  uploadImage: (noteId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<NoteImage>(`/notes/${noteId}/images`, { method: 'POST', body: form });
  },
  uploadAttachment: (noteId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<NoteAttachment>(`/notes/${noteId}/attachments`, { method: 'POST', body: form });
  },
  deleteAttachment: (noteId: string, attachmentId: string) =>
    request<void>(`/notes/${noteId}/attachments/${attachmentId}`, { method: 'DELETE' }),
  attachTag: (noteId: string, tagId: string) =>
    request<void>(`/notes/${noteId}/tags/${tagId}`, { method: 'POST' }),
  detachTag: (noteId: string, tagId: string) =>
    request<void>(`/notes/${noteId}/tags/${tagId}`, { method: 'DELETE' }),
  getShare: (noteId: string) =>
    request<ShareInfo | null>(`/notes/${noteId}/share`),
  createShare: (noteId: string) =>
    request<ShareInfo>(`/notes/${noteId}/share`, { method: 'POST' }),
  revokeShare: (noteId: string) =>
    request<void>(`/notes/${noteId}/share`, { method: 'DELETE' }),
};

/** Public read of a shared note — no JWT, no auth refresh on 401. */
export async function fetchPublicNote(token: string): Promise<PublicNote> {
  const res = await fetch(`${BASE_URL}/public/notes/${encodeURIComponent(token)}`);
  if (!res.ok) {
    throw new ApiError(res.status, res.status === 404 ? 'Note not found' : 'Failed to load');
  }
  return res.json();
}

export interface ShareInfo {
  token: string;
  url: string;
  created_at: string;
}

export interface PublicNote {
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
  shared_at: string;
  tags: Tag[];
}

// ── Tags ──────────────────────────────────────────────────────────────────────
export const tagsApi = {
  list: () => request<Tag[]>('/tags'),
  create: (name: string, color: string) =>
    request<Tag>('/tags', { method: 'POST', body: JSON.stringify({ name, color }) }),
  update: (id: string, data: { name?: string; color?: string }) =>
    request<Tag>(`/tags/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/tags/${id}`, { method: 'DELETE' }),
};

// ── Tasks ─────────────────────────────────────────────────────────────────────
export const tasksApi = {
  list: (status?: TaskStatus) =>
    request<Task[]>(`/tasks${status ? `?status_filter=${status}` : ''}`),
  create: (data: { title: string; description?: string; status?: TaskStatus; priority?: TaskPriority; start_date?: string | null; due_date?: string | null; color?: string; tag_ids?: string[] }) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { title?: string; description?: string; status?: TaskStatus; priority?: TaskPriority; start_date?: string | null; due_date?: string | null; is_completed?: boolean; order?: number; color?: string }) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  attachTag: (taskId: string, tagId: string) =>
    request<void>(`/tasks/${taskId}/tags/${tagId}`, { method: 'POST' }),
  detachTag: (taskId: string, tagId: string) =>
    request<void>(`/tasks/${taskId}/tags/${tagId}`, { method: 'DELETE' }),
};

// ── Todos ─────────────────────────────────────────────────────────────────────
export const gosApi = {
  list: () => request<Go[]>('/gos'),

  create: (data: {
    title: string;
    description?: string;
    kind?: GoKind;
    unit?: string;
    target_value?: number | null;
    recurrence?: GoRecurrence;
    start_date?: string | null;
    due_date?: string | null;
    color?: string;
    task_id?: string | null;
    step_id?: string | null;
  }) => request<Go>('/gos', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: {
    title?: string;
    description?: string;
    kind?: GoKind;
    unit?: string;
    target_value?: number | null;
    recurrence?: GoRecurrence;
    start_date?: string | null;
    due_date?: string | null;
    color?: string;
    task_id?: string | null;
    step_id?: string | null;
  }) => request<Go>(`/gos/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/gos/${id}`, { method: 'DELETE' }),

  upsertEntry: (goId: string, date: string, value: number) =>
    request<GoEntry>(`/gos/${goId}/entries`, {
      method: 'POST',
      body: JSON.stringify({ date, value }),
    }),

  agenda: (section: 'today' | 'future' | 'past', daysBack = 30) =>
    request<Go[]>(`/gos/agenda?section=${section}&days_back=${daysBack}`),
};

// ═══════════════════════════════════════════════════════════════════════════
// Steps API — milestone phases inside a Goal
// ═══════════════════════════════════════════════════════════════════════════
import type { Step, StepStatus } from './types';

export const stepsApi = {
  list: (taskId: string) => request<Step[]>(`/tasks/${taskId}/steps`),

  create: (taskId: string, data: {
    title: string;
    description?: string;
    position?: number;
    status?: StepStatus;
    start_date?: string | null;
    end_date?: string | null;
  }) => request<Step>(`/tasks/${taskId}/steps`, { method: 'POST', body: JSON.stringify(data) }),

  update: (stepId: string, data: {
    title?: string;
    description?: string;
    position?: number;
    status?: StepStatus;
    start_date?: string | null;
    end_date?: string | null;
  }) => request<Step>(`/steps/${stepId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (stepId: string) => request<void>(`/steps/${stepId}`, { method: 'DELETE' }),

  reorder: (taskId: string, stepIds: string[]) =>
    request<Step[]>(`/tasks/${taskId}/steps/reorder`, {
      method: 'POST',
      body: JSON.stringify({ step_ids: stepIds }),
    }),
};

// ═══════════════════════════════════════════════════════════════════════════
// Routines API
// ═══════════════════════════════════════════════════════════════════════════
import type { Routine, RoutineEntry } from './types';

export const routinesApi = {
  list: () => request<Routine[]>('/routines'),

  byGoal: (goalId: string) => request<Routine[]>(`/routines/by-goal/${goalId}`),

  dueToday: () => request<Routine[]>('/routines/agenda/today'),

  create: (data: {
    title: string;
    description?: string;
    color?: string;
    goal_id?: string | null;
    schedule_type?: 'daily' | 'weekly_on_days' | 'every_n_days' | 'times_per_week';
    schedule_days?: string;
    schedule_n_days?: number;
    schedule_count_per_period?: number;
    schedule_period?: 'week' | 'month';
    start_date?: string | null;
    end_date?: string | null;
    kind?: 'boolean' | 'numeric';
    unit?: string;
    target_value?: number | null;
  }) => request<Routine>('/routines', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Partial<Routine>) =>
    request<Routine>(`/routines/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/routines/${id}`, { method: 'DELETE' }),

  upsertEntry: (id: string, date: string, value: number) =>
    request<RoutineEntry>(`/routines/${id}/entries`, {
      method: 'POST',
      body: JSON.stringify({ date, value }),
    }),

  deleteEntry: (id: string, date: string) =>
    request<void>(`/routines/${id}/entries/${date}`, { method: 'DELETE' }),

  // ─── Goal-Routine links ────────────────────────────────────────────────────
  linksByGoal: (goalId: string) =>
    request<GoalRoutineLink[]>(`/routines/links/by-goal/${goalId}`),

  createLink: (data: {
    goal_id: string;
    routine_id: string;
    start_date: string;
    end_date?: string | null;
    target_count?: number | null;
  }) => request<GoalRoutineLink>('/routines/links', { method: 'POST', body: JSON.stringify(data) }),

  deleteLink: (linkId: string) =>
    request<void>(`/routines/links/${linkId}`, { method: 'DELETE' }),
};


// ═══════════════════════════════════════════════════════════════════════════
// Sprints API — temporal focus collection (NOT a Step inside a Goal).
// Backend model is FocusSprint (URL: /api/focus-sprints/*) for legacy reasons.
// ═══════════════════════════════════════════════════════════════════════════
import type { Sprint, SprintItemType } from './types';

export const sprintsApi = {
  list: () => request<Sprint[]>('/focus-sprints'),

  create: (data: {
    title: string;
    description?: string;
    start_date: string;
    end_date: string;
    color?: string;
  }) => request<Sprint>('/focus-sprints', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Partial<Sprint>) =>
    request<Sprint>(`/focus-sprints/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/focus-sprints/${id}`, { method: 'DELETE' }),

  addItem: (id: string, item: {
    item_type: SprintItemType;
    goal_id?: string | null;
    go_id?: string | null;
    routine_id?: string | null;
  }) => request<Sprint>(`/focus-sprints/${id}/items`, {
    method: 'POST',
    body: JSON.stringify(item),
  }),

  removeItem: (id: string, itemId: string) =>
    request<void>(`/focus-sprints/${id}/items/${itemId}`, { method: 'DELETE' }),
};


// ═══════════════════════════════════════════════════════════════════════════
// AI — generic job queue + per-feature sugar endpoints.
// Generation is async: callers enqueue, then poll /ai/jobs/{id} until status
// is done|failed. useAIJob hook wraps this.
// ═══════════════════════════════════════════════════════════════════════════
import type {
  AIJob,
  AIJobBrief,
  AIQuiz,
  InsightsCreate,
  QuizAttempt,
  QuizAttemptAnswer,
  QuizCreate,
  ScheduleCreate,
} from './types';

export const aiApi = {
  health: () => request<{ ok: boolean; kinds: string[] }>('/ai/health'),

  createQuiz: (body: QuizCreate) =>
    request<AIJob>('/ai/quiz', { method: 'POST', body: JSON.stringify(body) }),

  getJob: (jobId: string) => request<AIJob>(`/ai/jobs/${jobId}`),

  /** Recent jobs for the current user — used to rehydrate the AI-jobs
   *  sidebar after a page reload. */
  listJobs: (limit = 30) =>
    request<AIJobBrief[]>(`/ai/jobs?limit=${limit}`),

  cancelJob: (jobId: string) =>
    request<AIJob>(`/ai/jobs/${jobId}/cancel`, { method: 'POST' }),

  getQuiz: (quizId: string) => request<AIQuiz>(`/ai/quizzes/${quizId}`),

  submitAttempt: (quizId: string, answers: QuizAttemptAnswer[]) =>
    request<QuizAttempt>(`/ai/quizzes/${quizId}/attempts`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),

  createSchedule: (body: ScheduleCreate) =>
    request<AIJob>('/ai/schedule', { method: 'POST', body: JSON.stringify(body) }),

  createInsights: (body: InsightsCreate) =>
    request<AIJob>('/ai/insights', { method: 'POST', body: JSON.stringify(body) }),
};
