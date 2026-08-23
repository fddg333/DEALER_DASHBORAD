import { NextResponse } from 'next/server';

export async function POST(req) {
  const { password } = await req.json();

  if (password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('bm_auth', password, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 90, // 90 days
    path: '/',
  });
  return res;
}
