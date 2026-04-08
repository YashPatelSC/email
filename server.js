const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const nodemailer = require('nodemailer');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  envText.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const index = trimmed.indexOf('=');
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  });
}

const PORT = Number(process.env.PORT || 3040);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data', 'email-logs');

const DEFAULT_TEMPLATE = {
  fromName: 'Quality Inn West Columbia - Cayce',
  fromEmail: 'revmax.email@gmail.com',
  hotelName: 'Quality Inn West Columbia - Cayce',
  bookingUrl: 'https://www.choicehotels.com/south-carolina/west-columbia/quality-inn-hotels/sc588?mc=llgoxxpx',
  feedbackUrl: 'https://www.yourhotelreview.com/qualityinn/westcolumbia/',
  logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Quality_Inn_logo.svg/512px-Quality_Inn_logo.svg.png',
  subject: 'Thank you for staying with us, {{firstName}}',
  body: `Hi {{firstName}},\n\nThank you for staying with us at {{hotelName}}. We truly appreciate your business.\n\nIf you have a minute, we would love to hear about your stay:\n{{feedbackUrl}}\n\nWhen you are ready to book with us again, you can visit:\n{{bookingUrl}}\n\nThanks again,\n{{hotelName}}`
};

function sanitizeSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'unknown';
}

function smtpEnabled() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function ensureJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  };

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 404, { error: 'File not found' });
      return;
    }

    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function fillTemplate(template, guest, extra = {}) {
  const values = {
    firstName: guest.firstName || '',
    lastName: guest.lastName || '',
    fullName: `${guest.firstName || ''} ${guest.lastName || ''}`.trim(),
    email: guest.email || '',
    hotelName: extra.hotelName || '',
    bookingUrl: extra.bookingUrl || '',
    feedbackUrl: extra.feedbackUrl || ''
  };

  return String(template || '').replace(/{{\s*(firstName|lastName|fullName|email|hotelName|bookingUrl|feedbackUrl)\s*}}/g, (_, key) => values[key] || '');
}

function buildPreview(payload) {
  const guest = {
    firstName: String(payload.firstName || '').trim(),
    lastName: String(payload.lastName || '').trim(),
    email: String(payload.email || '').trim()
  };

  const template = {
    fromName: String(payload.fromName || DEFAULT_TEMPLATE.fromName).trim(),
    fromEmail: String(payload.fromEmail || DEFAULT_TEMPLATE.fromEmail).trim(),
    hotelName: String(payload.hotelName || DEFAULT_TEMPLATE.hotelName).trim(),
    bookingUrl: String(payload.bookingUrl || DEFAULT_TEMPLATE.bookingUrl).trim(),
    feedbackUrl: String(payload.feedbackUrl || DEFAULT_TEMPLATE.feedbackUrl).trim(),
    logoUrl: String(payload.logoUrl || DEFAULT_TEMPLATE.logoUrl).trim(),
    subject: String(payload.subject || DEFAULT_TEMPLATE.subject),
    body: String(payload.body || DEFAULT_TEMPLATE.body)
  };

  const renderedSubject = fillTemplate(template.subject, guest, template);
  const renderedBody = fillTemplate(template.body, guest, template);
  const renderedHtml = buildHtmlEmail({ guest, template, renderedBody });

  return {
    guest,
    template,
    rendered: {
      subject: renderedSubject,
      body: renderedBody,
      html: renderedHtml
    }
  };
}

function buildHtmlEmail({ guest, template, renderedBody }) {
  const safeParagraphs = renderedBody
    .split(/\n\n+/)
    .map((paragraph) => `<p style="margin:0 0 16px;color:#1f2937;font:16px/1.6 Arial,sans-serif;">${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f3f4f6;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr>
        <td style="padding:32px 32px 24px;background:#0f172a;text-align:center;">
          <a href="${template.bookingUrl}" target="_blank" style="text-decoration:none;display:inline-block;">
            <img src="${template.logoUrl}" alt="${template.hotelName}" style="max-width:220px;width:100%;height:auto;border:0;display:block;margin:0 auto 12px;" />
          </a>
          <div style="color:#e2e8f0;font:700 22px/1.3 Arial,sans-serif;">${template.hotelName}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          ${safeParagraphs}
          <div style="margin:28px 0 24px;text-align:center;">
            <a href="${template.feedbackUrl}" target="_blank" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;font:700 16px Arial,sans-serif;padding:14px 24px;border-radius:999px;">Leave Feedback</a>
          </div>
          <p style="margin:0 0 12px;color:#475569;font:14px/1.6 Arial,sans-serif;">If the button above does not work, copy and paste this link into your browser:</p>
          <p style="margin:0 0 24px;word-break:break-word;font:14px/1.6 Arial,sans-serif;"><a href="${template.feedbackUrl}" target="_blank" style="color:#0ea5e9;">${template.feedbackUrl}</a></p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="vertical-align:middle;padding-right:16px;width:180px;">
                <a href="${template.bookingUrl}" target="_blank" style="text-decoration:none;display:inline-block;">
                  <img src="${template.logoUrl}" alt="${template.hotelName}" style="max-width:160px;width:100%;height:auto;border:0;display:block;" />
                </a>
              </td>
              <td style="vertical-align:middle;">
                <div style="font:700 16px/1.4 Arial,sans-serif;color:#111827;">${template.hotelName}</div>
                <div style="margin-top:6px;font:14px/1.6 Arial,sans-serif;color:#475569;">We appreciate your stay and look forward to welcoming you back.</div>
                <div style="margin-top:10px;font:14px/1.6 Arial,sans-serif;"><a href="${template.bookingUrl}" target="_blank" style="color:#0ea5e9;text-decoration:none;">Book your next stay</a></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function listLogs(limit = 20) {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const fullPath = path.join(DATA_DIR, name);
      try {
        const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        return { ...parsed, filePath: fullPath };
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime())
    .slice(0, limit);
}

function logSendAttempt(entry) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${stamp}-${sanitizeSegment(entry.guest.email)}.json`;
  const filePath = path.join(DATA_DIR, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
  return filePath;
}

async function sendMailWithSmtp({ fromName, fromEmail, to, subject, text, html }) {
  if (!smtpEnabled()) {
    throw new Error('SMTP is not configured.');
  }

  const transport = createTransport();
  const info = await transport.sendMail({
    from: `${fromName} <${fromEmail || process.env.DEFAULT_FROM_EMAIL || process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html
  });

  return {
    ok: true,
    transport: 'Gmail SMTP via nodemailer',
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response
  };
}

async function handlePreview(req, res) {
  try {
    const payload = await ensureJsonBody(req);
    const preview = buildPreview(payload);
    sendJson(res, 200, { ok: true, preview });
  } catch (error) {
    sendJson(res, 400, { error: error.message || 'Preview failed' });
  }
}

async function handleSend(req, res) {
  try {
    const payload = await ensureJsonBody(req);
    const preview = buildPreview(payload);

    if (!preview.guest.firstName || !preview.guest.email) {
      sendJson(res, 400, { error: 'First name and email are required.' });
      return;
    }

    const attemptedAt = new Date().toISOString();
    const record = {
      attemptedAt,
      guest: preview.guest,
      template: preview.template,
      rendered: preview.rendered,
      status: 'pending'
    };

    try {
      const delivery = await sendMailWithSmtp({
        fromName: preview.template.fromName,
        fromEmail: preview.template.fromEmail,
        to: preview.guest.email,
        subject: preview.rendered.subject,
        text: preview.rendered.body,
        html: preview.rendered.html
      });
      record.status = 'sent';
      record.delivery = delivery;
    } catch (error) {
      record.status = 'failed';
      record.error = error.message;
    }

    const filePath = logSendAttempt(record);
    sendJson(res, record.status === 'sent' ? 200 : 500, {
      ok: record.status === 'sent',
      attempt: record,
      filePath
    });
  } catch (error) {
    sendJson(res, 400, { error: error.message || 'Send failed' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (req.method === 'GET' && url.pathname === '/api/config') {
    sendJson(res, 200, {
      appName: 'Guest Feedback Mailer',
      host: `${HOST}:${PORT}`,
      dataDir: DATA_DIR,
      defaults: DEFAULT_TEMPLATE,
      smtpReady: smtpEnabled(),
      recentSends: listLogs(10)
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/preview') {
    await handlePreview(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/send') {
    await handleSend(req, res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/sends/recent') {
    sendJson(res, 200, { sends: listLogs(20) });
    return;
  }

  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(requestedPath).replace(/^([.][.][/\\])+/, ''));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  sendFile(res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`Guest feedback app running at http://${HOST}:${PORT}`);
  console.log(`Email logs save under ${DATA_DIR}`);
});
