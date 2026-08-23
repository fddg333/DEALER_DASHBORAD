export function isAuthed(req) {
  const cookie = req.cookies.get('bm_auth');
  return cookie && cookie.value === process.env.APP_PASSWORD;
}
