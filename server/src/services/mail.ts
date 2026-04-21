import nodemailer from 'nodemailer';
import db from '../db';

const DEFAULT_FROM = process.env.SMTP_DEFAULT_FROM || 'noreply@taskit.jahosi.co.uk';

/** Strip CR and LF characters from a string to prevent email header injection. */
function sanitizeHeaderValue(s: string): string {
  return s.replace(/[\r\n]+/g, ' ');
}

/** Escape special HTML characters to prevent injection in HTML email bodies. */
function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

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
  const from = settings?.from_addr || DEFAULT_FROM;

  const isVerify = purpose === 'verify';
  const subject = isVerify ? 'Verify your TaskIt! account' : 'Your TaskIt! login link';
  const intro = isVerify
    ? 'Click the link below to verify your email address and activate your TaskIt! account (expires in 15 minutes):'
    : 'Click the link below to sign in to TaskIt! (expires in 15 minutes):';

  await transporter.sendMail({
    from,
    to,
    subject,
    text: `${intro}\n\n${link}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `<p>${intro}</p><p><a href="${escHtml(link)}">${escHtml(link)}</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
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
  const from = settings?.from_addr || DEFAULT_FROM;

  await transporter.sendMail({
    from,
    to,
    subject: 'Your TaskIt! verification code',
    text: `Your TaskIt! two-factor authentication code is: ${code}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
    html: `<p>Your TaskIt! two-factor authentication code is:</p><h2 style="letter-spacing:0.2em;">${code}</h2><p>This code expires in 10 minutes. Do not share it with anyone.</p>`,
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
  const from = settings?.from_addr || DEFAULT_FROM;

  // Plain-text label for subject/text body; HTML-escaped label for the HTML body.
  // sanitizeHeaderValue strips CR/LF to prevent email header injection in the subject line.
  const safeInviterName = inviterName ? sanitizeHeaderValue(inviterName) : undefined;
  const safeGroupName = sanitizeHeaderValue(groupName);
  const inviterLabel = safeInviterName ? `${safeInviterName} has` : 'You have been';
  const htmlInviterLabel = safeInviterName ? `${escHtml(safeInviterName)} has` : 'You have been';
  const subject = `${inviterLabel} invited you to join "${safeGroupName}" on TaskIt!`;
  const intro = `${htmlInviterLabel} invited you to join the group <strong>${escHtml(safeGroupName)}</strong> on TaskIt!.`;
  const body = `Click the link below to accept the invitation and join the group (link expires in 7 days):`;

  await transporter.sendMail({
    from,
    to,
    subject,
    text: `${inviterLabel} invited you to join "${safeGroupName}" on TaskIt!.\n\n${body}\n\n${inviteUrl}\n\nIf you did not expect this invitation, you can safely ignore this email.`,
    html: `<p>${intro}</p><p>${body}</p><p><a href="${escHtml(inviteUrl)}">${escHtml(inviteUrl)}</a></p><p>If you did not expect this invitation, you can safely ignore this email.</p>`,
  });
}

export async function sendPasswordReset(to: string, token: string, baseUrl: string): Promise<void> {
  const transporter = await getTransporter();
  const link = `${baseUrl}?resetToken=${token}`;

  if (!transporter) {
    console.warn('[mail] SMTP not configured or disabled — password reset link not emailed');
    console.info(`[mail] Password reset link for ${to}: ${link}`);
    return;
  }
  const settings = db.prepare('SELECT from_addr FROM smtp_settings WHERE id = 1').get() as { from_addr: string } | undefined;
  const from = settings?.from_addr || DEFAULT_FROM;

  await transporter.sendMail({
    from,
    to,
    subject: 'Reset your TaskIt! password',
    text: `Click the link below to reset your TaskIt! password (expires in 15 minutes):\n\n${link}\n\nIf you did not request a password reset, you can safely ignore this email.`,
    html: `<p>Click the link below to reset your TaskIt! password (expires in 15 minutes):</p><p><a href="${escHtml(link)}">${escHtml(link)}</a></p><p>If you did not request a password reset, you can safely ignore this email.</p>`,
  });
}

export async function sendTaskReminder(to: string, task: { title: string; due_date: number }, reminderLabel?: string): Promise<void> {
  const transporter = await getTransporter();
  if (!transporter) {
    console.warn('[mail] SMTP not configured or disabled — skipping task reminder email');
    return;
  }
  const settings = db.prepare('SELECT from_addr FROM smtp_settings WHERE id = 1').get() as { from_addr: string } | undefined;
  const from = settings?.from_addr || DEFAULT_FROM;
  const dueStr = new Date(task.due_date).toLocaleString();
  const isOverdue = task.due_date < Date.now();
  // sanitizeHeaderValue strips CR/LF to prevent email header injection in the subject line.
  const safeTitle = sanitizeHeaderValue(task.title);
  const safeLabel = sanitizeHeaderValue(reminderLabel ?? 'upcoming');
  const subject = isOverdue
    ? `Overdue: "${safeTitle}" was due on ${dueStr}`
    : `Reminder (${safeLabel}): "${safeTitle}" is due soon`;
  const bodyText = isOverdue
    ? `The task "${task.title}" was due on ${dueStr} and has not been completed.`
    : `This is a reminder that the task "${task.title}" is due on ${dueStr}.`;
  const bodyHtml = isOverdue
    ? `<p>The task <strong>${escHtml(task.title)}</strong> was due on <strong>${escHtml(dueStr)}</strong> and has not been completed.</p>`
    : `<p>This is a reminder that the task <strong>${escHtml(task.title)}</strong> is due on <strong>${escHtml(dueStr)}</strong>.</p>`;
  await transporter.sendMail({ from, to, subject, text: bodyText, html: bodyHtml });
}
