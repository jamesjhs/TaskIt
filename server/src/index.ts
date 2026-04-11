import express from 'express';
import cors from 'cors';
import path from 'path';
import rateLimit from 'express-rate-limit';
import './db'; // initialize database

import authRoutes from './routes/auth';
import groupRoutes from './routes/groups';
import taskRoutes from './routes/tasks';
import taskTypeRoutes from './routes/taskTypes';

const app = express();
const PORT = process.env.PORT || 3000;

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

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/groups', generalLimiter, groupRoutes);
app.use('/api/tasks', generalLimiter, taskRoutes);
app.use('/api/task-types', generalLimiter, taskTypeRoutes);

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', '..', 'public')));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Jobber server running on port ${PORT}`);
});

export default app;
