const { chromium } = require('playwright-core');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function findChrome() {
  const locations = [
    process.env.PROGRAMFILES,
    process.env['PROGRAMFILES(X86)'],
    process.env.LOCALAPPDATA,
  ].filter(Boolean).map((root) => path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));

  return locations.find((location) => fs.existsSync(location)) || null;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitForCdp(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        resolve(await chromium.connectOverCDP(`http://127.0.0.1:${port}`));
      } catch (error) {
        if (Date.now() >= deadline) {
          reject(new Error(`Chrome started but did not expose its automation port. ${error.message}`));
          return;
        }
        setTimeout(attempt, 250);
      }
    };
    attempt();
  });
}

async function launchThroughWindowsShell({ headless }) {
  const chromePath = findChrome();
  if (!chromePath) throw new Error('Google Chrome was not found on this server.');

  const port = await getFreePort();
  const profileDir = path.join(os.tmpdir(), `tasksmon-chrome-${crypto.randomUUID()}`);
  fs.mkdirSync(profileDir, { recursive: true });

  const argumentsList = [
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
  ];
  if (headless) argumentsList.push('--headless=new');

  // Start-Process avoids Windows policies that block Node from spawning Chrome directly.
  const command = `$process = Start-Process -FilePath '${chromePath.replace(/'/g, "''")}' -ArgumentList @(${argumentsList.map((item) => `'${item.replace(/'/g, "''")}'`).join(',')}) -PassThru; $process.Id`;
  const encodedCommand = Buffer.from(command, 'utf16le').toString('base64');
  let stdout;
  try {
    ({ stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand]));
  } catch (error) {
    if (error?.message?.includes('spawn EPERM')) {
      throw new Error(
        'Chrome launch is blocked by the process hosting this web app. Start npm from a normal Windows PowerShell or Command Prompt, or deploy the app to a server that permits browser automation.'
      );
    }
    throw error;
  }
  const processId = Number.parseInt(stdout.trim(), 10);

  try {
    const browser = await waitForCdp(port);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();
    const close = browser.close.bind(browser);
    browser.close = async () => {
      await close();
      if (Number.isInteger(processId)) {
        await execFileAsync('taskkill.exe', ['/PID', String(processId), '/T', '/F']).catch(() => {});
      }
      fs.rmSync(profileDir, { recursive: true, force: true });
    };
    return { browser, context, page };
  } catch (error) {
    if (Number.isInteger(processId)) {
      await execFileAsync('taskkill.exe', ['/PID', String(processId), '/T', '/F']).catch(() => {});
    }
    fs.rmSync(profileDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Launches an isolated Chrome session. The normal Playwright process launch
 * is preferred; Windows environments that return EPERM transparently use a
 * local CDP connection started via Start-Process instead.
 */
async function launchBrowser({ headless = false } = {}) {
  try {
    const browser = await chromium.launch({ channel: 'chrome', headless });
    const context = await browser.newContext();
    const page = await context.newPage();
    return { browser, context, page };
  } catch (error) {
    if (process.platform !== 'win32' || error?.message?.includes('spawn EPERM') !== true) throw error;
    return launchThroughWindowsShell({ headless });
  }
}

module.exports = { launchBrowser };
