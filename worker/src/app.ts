import { Hono } from 'hono';
import { healthRoutes } from './routes/health';
import type { Env } from './types';

export const app = new Hono<{ Bindings: Env }>();

app.route('/api', healthRoutes);
