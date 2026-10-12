// Destinos internos: conserva la sección o el título después de entrar.
export function safeContentDestination(raw, fallback = '/') {
  const value = String(raw || '').trim();
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return fallback;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    if (url.pathname === '/index.html' || url.pathname === '/index') url.pathname = '/';
    else url.pathname = url.pathname.replace(/\.html$/, '');
    if (['/login', '/register', '/profiles', '/recovery', '/recovery-pass'].includes(url.pathname.replace(/\/$/, ''))) return fallback;
    return url.pathname + url.search + url.hash;
  } catch (_) { return fallback; }
}

export function currentContentDestination() {
  return safeContentDestination(window.location.pathname + window.location.search + window.location.hash);
}

export function requestedContentDestination() {
  return safeContentDestination(new URL(window.location.href).searchParams.get('next'));
}

export function profilePickerUrl(next = currentContentDestination()) {
  return '/profiles?next=' + encodeURIComponent(safeContentDestination(next));
}

export function loginUrl(next = currentContentDestination()) {
  return '/login?next=' + encodeURIComponent(safeContentDestination(next));
}
