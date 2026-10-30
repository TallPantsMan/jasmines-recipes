import { authRequired, issueToken, passwordMatches, tokenIsValid } from './_auth.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  // GET: "do I need to sign in, and is my saved sign-in still good?"
  if (req.method === 'GET') {
    const required = authRequired();
    return res.status(200).json({ required, ok: !required || tokenIsValid(req.headers?.authorization) });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!authRequired()) return res.status(200).json({ token: '' });
  if (!process.env.APP_PASSWORD) {
    return res.status(503).json({ error: 'The password has not been set up on the server yet' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  if (passwordMatches(body?.password)) return res.status(200).json({ token: issueToken() });

  // Slows down anyone trying lots of guesses
  await new Promise((r) => setTimeout(r, 1000));
  return res.status(401).json({ error: 'That password is not right' });
}
