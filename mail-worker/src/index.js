import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import r2Service from './service/r2-service';
import oauthService from './service/oauth-service';
import analysisService from './service/analysis-service';
function decodePathSafely(path) {
  let current = path;
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

function isSensitivePath(rawPath) {
  let path = rawPath.split('?')[0].split('#')[0];
  path = decodePathSafely(path);
  path = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase();
  if (path === '/.well-known' || path.startsWith('/.well-known/')) return false;
  const segments = path.split('/').filter(Boolean);
  for (const seg of segments) {
    if (seg === '.env' || seg.startsWith('.env.') || seg.startsWith('.env-')) return true;
    if (seg === '.git' || seg.startsWith('.git')) return true;
    if (seg === '.config' || seg.startsWith('.config')) return true;
    if (seg === 'credentials' || seg.startsWith('credentials.') || seg.startsWith('credentials-')) return true;
    if (seg === '.credentials' || seg.startsWith('.credentials')) return true;
    if (seg === '.aws' || seg === '.ssh') return true;
  }
  return false;
}

export default {
	async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (isSensitivePath(url.pathname) || isSensitivePath(req.url)) {
			return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
		}

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		if (url.pathname.startsWith('/oss/')) {
			const key = url.pathname.slice('/oss/'.length);
			const resp = await r2Service.toObjResp({ env }, key);
			return resp || new Response('Not Found', { status: 404 });
		}

		if (['/static/', '/attachments/'].some(p => url.pathname.startsWith(p))) {
			const resp = await r2Service.toObjResp({ env }, url.pathname.substring(1));
			return resp || new Response('Not Found', { status: 404 });
		}

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		if (c.cron === '*/30 * * * *') {
			await analysisService.refreshEchartsCache({ env })
			return;
		}

		await verifyRecordService.clearRecord({ env })
		await userService.resetDaySendCount({ env })
		await emailService.completeReceiveAll({ env })
		await emailService.autoClean({ env })
		await analysisService.refreshEchartsCache({ env })
		await oauthService.clearNoBindOathUser({ env })
	},
};
