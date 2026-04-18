const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('access_token');

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  // Token expired — try refresh once
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(path, init); // retry once
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, err.detail ?? 'Unknown error');
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  const refresh_token = localStorage.getItem('refresh_token');
  if (!refresh_token) return false;
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
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (email: string, username: string, password: string) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ email, username, password }) }),

  login: async (email: string, password: string) => {
    const data = await request<{ access_token: string; refresh_token: string }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) }
    );
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data;
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },

  me: () => request('/auth/me'),
};

// ─── Ways ─────────────────────────────────────────────────────────────────────
export const waysApi = {
  list: () => request('/ways'),
  create: (name: string, order = 0) =>
    request('/ways', { method: 'POST', body: JSON.stringify({ name, order }) }),
  update: (id: string, data: { name?: string; order?: number }) =>
    request(`/ways/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/ways/${id}`, { method: 'DELETE' }),
  reorder: (items: { id: string; order: number }[]) =>
    request('/ways/reorder', { method: 'POST', body: JSON.stringify({ items }) }),
};

// ─── Topics ───────────────────────────────────────────────────────────────────
export const topicsApi = {
  create: (wayId: string, name: string, order = 0) =>
    request(`/ways/${wayId}/topics`, { method: 'POST', body: JSON.stringify({ name, order }) }),
  update: (id: string, data: { name?: string; order?: number }) =>
    request(`/topics/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/topics/${id}`, { method: 'DELETE' }),
};

// ─── Notes ────────────────────────────────────────────────────────────────────
export const notesApi = {
  create: (data: {
    name: string;
    content?: string;
    way_id?: string;
    topic_id?: string;
    topic_inline_id?: string;
  }) => request('/notes', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: { name?: string; content?: string }) =>
    request(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request(`/notes/${id}`, { method: 'DELETE' }),

  uploadImage: (noteId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const token = localStorage.getItem('access_token');
    return fetch(`${BASE_URL}/notes/${noteId}/images`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then((r) => r.json()) as Promise<{ id: string; url: string }>;
  },
};

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const tasksApi = {
  list: (status?: string) =>
    request(`/tasks${status ? `?status_filter=${status}` : ''}`),
  create: (data: { title: string; description?: string; status?: string; priority?: string; due_date?: string }) =>
    request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { title?: string; status?: string; priority?: string; is_completed?: boolean; due_date?: string }) =>
    request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/tasks/${id}`, { method: 'DELETE' }),
  reorder: (items: { id: string; order: number }[]) =>
    request('/tasks/reorder', { method: 'POST', body: JSON.stringify({ items }) }),
};

// ─── Metrics ──────────────────────────────────────────────────────────────────
export const metricsApi = {
  list: () => request('/metrics'),
  create: (data: { name: string; unit?: string; target_value?: number; color?: string }) =>
    request('/metrics', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; unit?: string; target_value?: number; color?: string }) =>
    request(`/metrics/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/metrics/${id}`, { method: 'DELETE' }),
  addEntry: (metricId: string, value: number, date: string, note = '') =>
    request(`/metrics/${metricId}/entries`, {
      method: 'POST',
      body: JSON.stringify({ value, date, note }),
    }),
  deleteEntry: (metricId: string, entryId: string) =>
    request(`/metrics/${metricId}/entries/${entryId}`, { method: 'DELETE' }),
};
