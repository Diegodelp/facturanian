import { Buffer } from 'node:buffer';
import { NextRequest } from 'next/server';

export function hasValidBasicAuth(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return true;
  const header = req.headers.get('authorization');
  if (!header || !header.startsWith('Basic ')) {
    return false;
  }
  try {
    const raw = Buffer.from(header.split(' ')[1], 'base64').toString('utf8');
    const [u, p] = raw.split(':');
    return u === user && p === pass;
  } catch (err) {
    console.error('Failed to parse basic auth header', err);
    return false;
  }
}
