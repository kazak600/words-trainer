import { Hono } from 'hono';
import { requireAuth } from './middleware/auth';
import { protectedAuthRoutes, publicAuthRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { leechRoutes } from './routes/leeches';
import { manualRoutes } from './routes/manual';
import { statsRoutes } from './routes/stats';
import { studyRoutes } from './routes/study';
import { wordRoutes } from './routes/words';
import type { Env } from './types';

export const app = new Hono<{ Bindings: Env }>();

app.route('/api', healthRoutes);
app.route('/api', publicAuthRoutes);

app.use('/api/*', requireAuth);
app.route('/api', protectedAuthRoutes);
app.route('/api', wordRoutes);
app.route('/api', studyRoutes);
app.route('/api', statsRoutes);
app.route('/api', leechRoutes);
app.route('/api', manualRoutes);
