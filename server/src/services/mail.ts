import nodemailer from 'nodemailer';
import db from '../db';

interface SmtpSettings {
  host: string;
  port: number;
  secure: number;
  username: string;
  pass: string;
  from_addr: string;
  enabled: number;
}

export async function getTransporter(): Promise<nodemailer.Transporter | null> {
  const settings = db.prepare('SELECT * FROM smtp_settings WHERE id = 1').get() as SmtpSettings | undefined;
  if (!settings || !settings.enabled || !settings.host) {
    return null;
  }
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure === 1,
    auth: settings.username ? { user: settings.username, pass: settings.pass } : undefined,
  });
}

export async function sendMagicLink(to: string, token: string, baseUrl: string): Promise<void> {
  const transporter = await getTransporter();
  if (!transporter) {
    console.warn('[mail] SMTP not configured or disabled — skipping magic link email');
    return;
  }
  const settings = db.prepare('SELECT from_addr FROM smtp_settings WHERE id = 1').get() as { from_addr: string } | undefined;
  const from = settings?.from_addr || 'noreply@jobber.app';
  const link = `${baseUrl}?token=${token}`;
  await transporter.sendMail({
    from,
    to,
    subject: 'Your Jobber login link',
    text: `Click the link below to sign in to Jobber (expires in 15 minutes):\n\n${link}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `<p>Click the link below to sign in to Jobber (expires in 15 minutes):</p><p><a href="${link}">${link}</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
  });
}

export async function sendTaskReminder(to: string, task: { title: string; due_date: number }): Promise<void> {
  const transporter = await getTransporter();
  if (!transporter) {
    console.warn('[mail] SMTP not configured or disabled — skipping task reminder email');
    return;
  }
  const settings = db.prepare('SELECT from_addr FROM smtp_settings WHERE id = 1').get() as { from_addr: string } | undefined;
  const from = settings?.from_addr || 'noreply@jobber.app';
  const dueStr = new Date(task.due_date).toLocaleString();
  await transporter.sendMail({
    from,
    to,
    subject: `Reminder: "${task.title}" is due soon`,
    text: `This is a reminder that the task "${task.title}" is due on ${dueStr}.`,
    html: `<p>This is a reminder that the task <strong>${task.title}</strong> is due on <strong>${dueStr}</strong>.</p>`,
  });
}
