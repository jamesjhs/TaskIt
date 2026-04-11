import express from 'express';
import cors from 'cors';
import path from 'path';
import './db'; // initialize database

import authRoutes from './routes/auth';
import groupRoutes from './routes/groups';
import taskRoutes from './routes/tasks';
import taskTypeRoutes from './routes/taskTypes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/task-types', taskTypeRoutes);

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
