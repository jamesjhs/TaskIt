import express from 'express';
import cors from 'cors';
import path from 'path';
import rateLimit from 'express-rate-limit';
import './db'; // initialize database
import { APP_VERSION, PORT } from './config';
import { startScheduler } from './services/scheduler';

import authRoutes from './routes/auth';
import groupRoutes from './routes/groups';
import taskRoutes from './routes/tasks';
import taskTypeRoutes from './routes/taskTypes';
import adminRoutes from './routes/admin';
import userRoutes from './routes/users';

const app = express();

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(express.json());

// Version endpoint
app.get('/api/version', (_req, res) => {
  res.json({ version: APP_VERSION });
});

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/groups', generalLimiter, groupRoutes);
app.use('/api/tasks', generalLimiter, taskRoutes);
app.use('/api/task-types', generalLimiter, taskTypeRoutes);
app.use('/api/admin', generalLimiter, adminRoutes);
app.use('/api/users', generalLimiter, userRoutes);

// Serve static frontend files
app.use(generalLimiter, express.static(path.join(__dirname, '..', '..', 'public')));

// SPA fallback
app.get('*', generalLimiter, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

startScheduler();

app.listen(PORT, () => {
  console.log(`Jobber server running on port ${PORT}`);
});

export default app;
