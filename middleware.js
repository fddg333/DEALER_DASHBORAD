import { NextResponse } from 'next/server';

export function middleware(req) {
  const { pathname } = req.nextUrl;

  // Always allow the login page and the login API
  if (pathname === '/login' || pathname === '/api/login') {
    return NextResponse.next();
  }

  const cookie = req.cookies.get('bm_auth');
  const authed = cookie && cookie.value === process.env.APP_PASSWORD;

  if (!authed) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/dashboard/:path*', '/api/:path*'],
};
