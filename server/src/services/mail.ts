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

export async function sendMagicLink(to: string, token: string, baseUrl: string, purpose: 'login' | 'verify' = 'login'): Promise<void> {
  const transporter = await getTransporter();
  const link = `${baseUrl}?token=${token}`;

  if (!transporter) {
    console.warn('[mail] SMTP not configured or disabled — magic link not emailed');
    console.info(`[mail] Magic link (${purpose}) for ${to}: ${link}`);
    return;
  }
  const settings = db.prepare('SELECT from_addr FROM smtp_settings WHERE id = 1').get() as { from_addr: string } | undefined;
  const from = settings?.from_addr || 'noreply@jobber.app';

  const isVerify = purpose === 'verify';
  const subject = isVerify ? 'Verify your Jobber account' : 'Your Jobber login link';
  const intro = isVerify
    ? 'Click the link below to verify your email address and activate your Jobber account (expires in 15 minutes):'
    : 'Click the link below to sign in to Jobber (expires in 15 minutes):';

  await transporter.sendMail({
    from,
    to,
    subject,
    text: `${intro}\n\n${link}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `<p>${intro}</p><p><a href="${link}">${link}</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
  });
}

export async function sendOTP(to: string, code: string): Promise<void> {
  const transporter = await getTransporter();

  if (!transporter) {
    console.warn('[mail] SMTP not configured or disabled — OTP not emailed');
    console.info(`[mail] 2FA OTP for ${to}: ${code}`);
    return;
  }
  const settings = db.prepare('SELECT from_addr FROM smtp_settings WHERE id = 1').get() as { from_addr: string } | undefined;
  const from = settings?.from_addr || 'noreply@jobber.app';

  await transporter.sendMail({
    from,
    to,
    subject: 'Your Jobber verification code',
    text: `Your Jobber two-factor authentication code is: ${code}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
    html: `<p>Your Jobber two-factor authentication code is:</p><h2 style="letter-spacing:0.2em;">${code}</h2><p>This code expires in 10 minutes. Do not share it with anyone.</p>`,
  });
}

export async function sendGroupInvite(to: string, groupName: string, inviteUrl: string, inviterName?: string): Promise<void> {
  const transporter = await getTransporter();

  if (!transporter) {
    console.warn('[mail] SMTP not configured or disabled — group invite not emailed');
    console.info(`[mail] Group invite for ${to} to join "${groupName}": ${inviteUrl}`);
    return;
  }
  const settings = db.prepare('SELECT from_addr FROM smtp_settings WHERE id = 1').get() as { from_addr: string } | undefined;
  const from = settings?.from_addr || 'noreply@jobber.app';

  const inviterLabel = inviterName ? `${inviterName} has` : 'You have been';
  const subject = `${inviterLabel} invited you to join "${groupName}" on Jobber`;
  const intro = `${inviterLabel} invited you to join the group <strong>${groupName}</strong> on Jobber.`;
  const body = `Click the link below to accept the invitation and join the group (link expires in 7 days):`;

  await transporter.sendMail({
    from,
    to,
    subject,
    text: `${inviterLabel} invited you to join "${groupName}" on Jobber.\n\n${body}\n\n${inviteUrl}\n\nIf you did not expect this invitation, you can safely ignore this email.`,
    html: `<p>${intro}</p><p>${body}</p><p><a href="${inviteUrl}">${inviteUrl}</a></p><p>If you did not expect this invitation, you can safely ignore this email.</p>`,
  });
}

export async function sendTaskReminder(to: string, task: { title: string; due_date: number }, reminderLabel?: string): Promise<void> {
  const transporter = await getTransporter();
  if (!transporter) {
    console.warn('[mail] SMTP not configured or disabled — skipping task reminder email');
    return;
  }
  const settings = db.prepare('SELECT from_addr FROM smtp_settings WHERE id = 1').get() as { from_addr: string } | undefined;
  const from = settings?.from_addr || 'noreply@jobber.app';
  const dueStr = new Date(task.due_date).toLocaleString();
  const isOverdue = task.due_date < Date.now();
  const subject = isOverdue
    ? `Overdue: "${task.title}" was due on ${dueStr}`
    : `Reminder (${reminderLabel ?? 'upcoming'}): "${task.title}" is due soon`;
  const bodyText = isOverdue
    ? `The task "${task.title}" was due on ${dueStr} and has not been completed.`
    : `This is a reminder that the task "${task.title}" is due on ${dueStr}.`;
  const bodyHtml = isOverdue
    ? `<p>The task <strong>${task.title}</strong> was due on <strong>${dueStr}</strong> and has not been completed.</p>`
    : `<p>This is a reminder that the task <strong>${task.title}</strong> is due on <strong>${dueStr}</strong>.</p>`;
  await transporter.sendMail({ from, to, subject, text: bodyText, html: bodyHtml });
}
