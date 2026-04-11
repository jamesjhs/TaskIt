const secret = process.env.JWT_SECRET;
if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  console.warn('WARNING: JWT_SECRET not set — using insecure default. Set JWT_SECRET before deploying.');
}
export const JWT_SECRET = secret ?? 'jobber-dev-secret-change-before-deploy';
