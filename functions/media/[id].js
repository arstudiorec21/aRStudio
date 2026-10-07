const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

export async function onRequestGet(context) {
  const id = String(context.params.id || '').trim();

  if (!DRIVE_ID_RE.test(id)) {
    return new Response('Invalid Google Drive file ID.', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  // Public Drive download endpoint. Cloudflare follows the redirect server-side,
  // so the browser receives a normal image response from the AR Studio domain.
  const driveUrl = new URL('https://drive.usercontent.google.com/download');
  driveUrl.searchParams.set('id', id);
  driveUrl.searchParams.set('export', 'download');
  driveUrl.searchParams.set('confirm', 't');

  let upstream;
  try {
    upstream = await fetch(driveUrl.toString(), {
      redirect: 'follow',
      cf: {
        cacheEverything: true,
        cacheTtl: 86400
      },
      headers: {
        // A regular browser UA helps Drive return the actual public file response.
        'User-Agent': 'Mozilla/5.0 AR-Studio-Media-Proxy/1.0'
      }
    });
  } catch (err) {
    return new Response('Unable to reach Google Drive.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  if (!upstream.ok) {
    return new Response('Google Drive file could not be loaded. Make sure the file is shared as Anyone with the link - Viewer.', {
      status: upstream.status === 404 ? 404 : 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';

  // If Drive returns an HTML permission/login/interstitial page, do not cache it as an image.
  if (contentType.includes('text/html')) {
    return new Response('Google Drive returned a web page instead of the file. Set sharing to Anyone with the link - Viewer.', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }

  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
  headers.set('Content-Disposition', 'inline');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Access-Control-Allow-Origin', '*');

  const etag = upstream.headers.get('etag');
  const lastModified = upstream.headers.get('last-modified');
  if (etag) headers.set('ETag', etag);
  if (lastModified) headers.set('Last-Modified', lastModified);

  return new Response(upstream.body, {
    status: 200,
    headers
  });
}

export async function onRequestHead(context) {
  // Reuse GET behavior; Pages/Workers will omit the response body for HEAD clients.
  return onRequestGet(context);
}
