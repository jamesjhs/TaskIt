import webpush from 'web-push';
import db from './db';

export interface VapidSettings {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** Read the current VAPID settings from the database. */
export function getVapidFromDb(): VapidSettings {
  const row = db.prepare('SELECT public_key, private_key, subject FROM vapid_settings WHERE id = 1').get() as
    | { public_key: string; private_key: string; subject: string }
    | undefined;
  return {
    publicKey: row?.public_key || '',
    privateKey: row?.private_key || '',
    subject: row?.subject || 'mailto:admin@localhost',
  };
}

/**
 * (Re)configure the web-push library with the current VAPID settings from the DB.
 * Call this at startup and after any VAPID settings update.
 */
export function reconfigureWebpush(): void {
  const { publicKey, privateKey, subject } = getVapidFromDb();
  if (publicKey && privateKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }
}
