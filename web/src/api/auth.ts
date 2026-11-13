import { api } from './client';

export type User = { username: string };

export const fetchMe = () => api<User>('/api/me');
export const login = (username: string, password: string) =>
  api<User>('/api/login', { method: 'POST', body: { username, password } });
export const logout = () =>
  api<{ ok: boolean }>('/api/logout', { method: 'POST' });
