// منطق مشترک API — هم روی Cloudflare Workers اجرا می‌شود هم روی Pages Functions.
// فقط دادهٔ عمومی آموزشی؛ هیچ راز/توکنی اینجا نیست و CORS باز است تا
// اپ‌های موبایل و دسکتاپ (با مبدأ file://) بتوانند بانک سوال را تازه کنند.
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'accept, content-type',
  'access-control-max-age': '86400',
  'x-content-type-options': 'nosniff',
};

const json = (body, status = 200, cacheSeconds = 300) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, 'cache-control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}` },
  });

export function catalogStats(catalog) {
  return {
    grades: catalog.grades.length,
    subjects: catalog.subjects.length,
    lessons: catalog.lessons.length,
    qa: catalog.lessons.reduce((n, l) => n + l.qa.length, 0),
  };
}

export function handleApi(request, catalog) {
  const url = new URL(request.url);
  const { pathname } = url;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ ok: false, error: 'method_not_allowed' }, 405, 0);

  if (pathname === '/api/health') {
    return json({ ok: true, app: 'hamyar-plus', version: catalog.version, updatedAt: catalog.updatedAt, ...catalogStats(catalog) }, 200, 60);
  }

  // نقطهٔ اتصال اپ‌های اندروید و ویندوز: اپ اول این را صدا می‌زند؛ اگر جواب گرفت
  // نسخهٔ آنلاین سایت را باز می‌کند، وگرنه نسخهٔ لوکالِ داخل خودش را می‌آورد.
  if (pathname === '/api/v1/client/bootstrap') {
    return json({
      ok: true,
      app: 'hamyar-plus',
      version: 1,
      origin: url.origin,
      appUrl: url.origin + '/',
      catalogVersion: catalog.version,
      catalogUpdatedAt: catalog.updatedAt,
      siteName: 'همیار پلاس',
    }, 200, 60);
  }

  if (pathname === '/api/catalog') return json(catalog, 200, 600);

  const byKind = (kind, list) => {
    const id = decodeURIComponent(pathname.slice(`/api/${kind}/`.length));
    const found = list.find((x) => String(x.id) === id);
    return found ? json({ ok: true, [kind]: found }) : json({ ok: false, error: 'not_found' }, 404, 0);
  };
  if (pathname.startsWith('/api/grade/')) return byKind('grade', catalog.grades);
  if (pathname.startsWith('/api/subject/')) return byKind('subject', catalog.subjects);
  if (pathname.startsWith('/api/lesson/')) return byKind('lesson', catalog.lessons);

  if (pathname === '/api/search') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (q.length < 2) return json({ ok: true, results: [] });
    const subjectOf = new Map(catalog.subjects.map((s) => [s.id, s]));
    const results = [];
    for (const l of catalog.lessons) {
      const hay = [l.title, l.summary, ...(l.points || []), ...l.qa.flatMap((x) => [x.q, x.a])].join(' ').toLowerCase();
      if (!hay.includes(q)) continue;
      const s = subjectOf.get(l.subject);
      results.push({ lesson: l.id, title: l.title, grade: l.grade, subject: s?.title || '', subjectId: l.subject });
      if (results.length >= 30) break;
    }
    return json({ ok: true, results });
  }

  return json({ ok: false, error: 'not_found' }, 404, 0);
}
