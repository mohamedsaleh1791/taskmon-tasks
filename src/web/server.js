const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runAutomation } = require('../automation/runController');

const requestedPort = Number.parseInt(process.env.PORT || '', 10);
const PORT = Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort < 65536
  ? requestedPort
  : 3000;
const publicDir = path.join(__dirname, 'public');
const reportsDir = path.resolve(__dirname, '..', '..', 'reports', 'web');
const screenshotsDir = path.resolve(__dirname, '..', '..', 'screenshots', 'web');
const jobs = new Map();

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(screenshotsDir, { recursive: true });

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }[extension] || 'application/octet-stream';
}

function serveFile(res, filePath, download = false) {
  if (!fs.existsSync(filePath)) return send(res, 404, { error: 'File not found.' });
  const headers = { 'Content-Type': contentType(filePath) };
  if (download) headers['Content-Disposition'] = `attachment; filename="${path.basename(filePath)}"`;
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) reject(new Error('Request is too large.'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid request body.')); }
    });
    req.on('error', reject);
  });
}

function publish(job, event) {
  job.events.push(event);
  for (const client of job.clients) client.write(`data: ${JSON.stringify(event)}\n\n`);
}

function cleanJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) if (job.createdAt < cutoff && job.status !== 'running') jobs.delete(id);
}

function startJob(config) {
  const id = crypto.randomUUID();
  const job = { id, createdAt: Date.now(), status: 'running', stopRequested: false, events: [], clients: new Set() };
  jobs.set(id, job);
  publish(job, { type: 'status', status: 'running' });

  void (async () => {
    try {
      const summary = await runAutomation({
      ...config,
      headless: true,
      reportsDir,
      screenshotsDir,
      onProgress: (progress) => publish(job, { type: 'progress', progress }),
      onLog: (line) => publish(job, { type: 'log', line }),
      shouldStop: () => job.stopRequested,
    });
      job.reports = {
        success: summary.reportSummary.successPath || null,
        failed: summary.reportSummary.failedPath || null,
      };
      job.status = 'finished';
      publish(job, {
      type: 'finished',
      summary: {
        totalSuccess: summary.reportSummary.totalSuccess,
        totalFailed: summary.reportSummary.totalFailed,
        successReport: Boolean(summary.reportSummary.successPath),
        failedReport: Boolean(summary.reportSummary.failedPath),
        validationErrorCount: summary.validationErrors.length,
      },
      });
    } catch (error) {
      job.status = 'error';
      publish(job, { type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      job.clients.forEach((client) => client.end());
      job.clients.clear();
      cleanJobs();
    }
  })();
  return id;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/') return serveFile(res, path.join(publicDir, 'index.html'));
  if (req.method === 'GET' && url.pathname === '/assets/xlsx.full.min.js') {
    return serveFile(res, path.resolve(__dirname, '..', '..', 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'));
  }
  if (req.method === 'GET' && ['app.js', 'styles.css'].includes(url.pathname.slice(1))) {
    return serveFile(res, path.join(publicDir, url.pathname.slice(1)));
  }
  if (req.method === 'POST' && url.pathname === '/api/jobs') {
    try {
      const config = await readJson(req);
      if (!config.siteUrl || !config.username || !config.password || !Array.isArray(config.tasks)) {
        return send(res, 400, { error: 'URL, username, password, and task rows are required.' });
      }
      const id = startJob(config);
      return send(res, 202, { id });
    } catch (error) {
      return send(res, 400, { error: error.message });
    }
  }
  const eventsMatch = url.pathname.match(/^\/api\/jobs\/([\w-]+)\/events$/);
  if (req.method === 'GET' && eventsMatch) {
    const job = jobs.get(eventsMatch[1]);
    if (!job) return send(res, 404, { error: 'Run not found or expired.' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    job.events.forEach((event) => res.write(`data: ${JSON.stringify(event)}\n\n`));
    if (job.status === 'running') {
      job.clients.add(res);
      req.on('close', () => job.clients.delete(res));
    } else res.end();
    return;
  }
  const reportMatch = url.pathname.match(/^\/api\/jobs\/([\w-]+)\/reports\/(success|failed)$/);
  if (req.method === 'GET' && reportMatch) {
    const job = jobs.get(reportMatch[1]);
    const reportPath = job?.reports?.[reportMatch[2]];
    if (!reportPath) return send(res, 404, { error: 'Report not found or expired.' });
    return serveFile(res, reportPath, true);
  }
  const stopMatch = url.pathname.match(/^\/api\/jobs\/([\w-]+)\/stop$/);
  if (req.method === 'POST' && stopMatch) {
    const job = jobs.get(stopMatch[1]);
    if (!job) return send(res, 404, { error: 'Run not found or expired.' });
    job.stopRequested = true;
    publish(job, { type: 'log', line: 'Stop requested. The current task will finish first.' });
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'Not found.' });
});

if (process.env.PORT && PORT === 3000 && process.env.PORT !== '3000') {
  console.warn(`Ignoring invalid PORT value "${process.env.PORT}" and using 3000.`);
}

server.listen(PORT, () => console.log(`TasksMon web app is running at http://localhost:${PORT}`));
