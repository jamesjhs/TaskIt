import { Router, Request, Response } from 'express';
import db from '../db';
import { routeParam } from '../http';

const router = Router();

router.get('/opt-out/:token', (req: Request, res: Response): void => {
  const token = routeParam(req.params.token);
  if (!token || token.length > 128) {
    res.status(400).send('Invalid opt-out link.');
    return;
  }

  const result = db.prepare('UPDATE users SET marketing_emails_opted_out = 1 WHERE marketing_opt_out_token = ?').run(token);
  if (result.changes === 0) {
    res.status(404).send('This opt-out link was not recognised.');
    return;
  }

  res
    .status(200)
    .type('html')
    .send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>TaskIt! email opt-out</title>
  <style>
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#111827;margin:0;padding:32px}
    main{max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;box-shadow:0 8px 24px rgba(15,23,42,.08)}
    h1{font-size:1.4rem;margin:0 0 12px}
    p{line-height:1.5;color:#4b5563}
    a{color:#7c3aed}
  </style>
</head>
<body>
  <main>
    <h1>You have opted out</h1>
    <p>Promotional emails for this TaskIt! account have been disabled.</p>
    <p><a href="/privacy-policy.html">Privacy Policy</a></p>
  </main>
</body>
</html>`);
});

export default router;
