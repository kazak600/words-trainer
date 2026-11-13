import { Hono } from 'hono';
import { requireAuth } from './middleware/auth';
import { protectedAuthRoutes, publicAuthRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { wordRoutes } from './routes/words';
import type { Env } from './types';

export const app = new Hono<{ Bindings: Env }>();

app.route('/api', healthRoutes);
app.route('/api', publicAuthRoutes);

app.use('/api/*', requireAuth);
app.route('/api', protectedAuthRoutes);
app.route('/api', wordRoutes);
