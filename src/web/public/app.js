const requiredColumns = ['TaskID', 'Account', 'ActualDuration', 'ReportedDuration', 'HourlyRate', 'Notes'];
let tasks = [];
let jobId = null;
let events = null;

const $ = (id) => document.getElementById(id);
const log = (line) => { const area = $('logs'); area.textContent += `${area.textContent ? '\n' : ''}${line}`; area.scrollTop = area.scrollHeight; };
const setStatus = (text, mode = '') => { $('runStatus').textContent = text; $('runStatus').className = `status ${mode}`; };

function showValidation(errors) {
  const box = $('validation');
  box.hidden = errors.length === 0;
  box.innerHTML = errors.length ? `<strong>${errors.length} issue${errors.length === 1 ? '' : 's'} found</strong><ul>${errors.slice(0, 8).map((error) => `<li>Row ${error.row}: ${error.message}</li>`).join('')}</ul>${errors.length > 8 ? '<p>Additional issues are not shown.</p>' : ''}` : '';
}

function validateRows(rows) {
  const headers = Object.keys(rows[0] || {});
  const missing = requiredColumns.filter((name) => !headers.includes(name));
  if (missing.length) return { tasks: [], errors: [{ row: 1, message: `Missing required columns: ${missing.join(', ')}.` }] };
  const errors = [];
  const valid = [];
  rows.forEach((row, index) => {
    const issues = [];
    const account = String(row.Account ?? '').trim();
    const actual = String(row.ActualDuration ?? '').trim();
    const reported = String(row.ReportedDuration ?? '').trim();
    if (!String(row.TaskID ?? '').trim()) issues.push('TaskID is missing');
    if (!/^Account\s*#\s*\d+$/i.test(account)) issues.push(`Account must look like "Account #123"`);
    if (!/^\d{1,2}:\d{2}:\d{2}$/.test(actual)) issues.push('ActualDuration must be HH:MM:SS');
    if (!/^\d{1,2}:\d{2}:\d{2}$/.test(reported)) issues.push('ReportedDuration must be HH:MM:SS');
    if (row.HourlyRate === '' || Number.isNaN(Number(row.HourlyRate))) issues.push('HourlyRate must be a number');
    if (issues.length) errors.push({ row: index + 2, message: issues.join('; ') });
    else valid.push({ TaskID: String(row.TaskID).trim(), Account: account, ActualDuration: actual, ReportedDuration: reported, HourlyRate: Number(row.HourlyRate), Notes: String(row.Notes ?? '').trim() });
  });
  return { tasks: valid, errors };
}

$('taskFile').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  tasks = [];
  showValidation([]);
  $('fileName').textContent = file ? file.name : 'No file selected';
  if (!file) return;
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    const result = validateRows(rows);
    tasks = result.tasks;
    showValidation(result.errors);
    log(result.errors.length ? `Imported ${tasks.length} valid tasks; fix ${result.errors.length} issue(s) before starting.` : `Imported ${tasks.length} tasks from ${file.name}.`);
  } catch (error) {
    showValidation([{ row: 0, message: 'This file could not be read as an Excel workbook.' }]);
    log(`Import error: ${error.message}`);
  }
});

function updateProgress(progress) {
  $('total').textContent = progress.total;
  $('completed').textContent = progress.completed;
  $('failed').textContent = progress.failed;
  $('remaining').textContent = progress.remaining;
  $('current').textContent = progress.current || 'Preparing run';
  $('progressBar').style.width = `${progress.total ? ((progress.completed + progress.failed) / progress.total) * 100 : 0}%`;
}

function finish(summary) {
  setStatus('Complete', 'success');
  $('startButton').disabled = false;
  $('stopButton').disabled = true;
  const links = [];
  if (summary.successReport) links.push(`<a href="/api/jobs/${encodeURIComponent(jobId)}/reports/success">Download success report</a>`);
  if (summary.failedReport) links.push(`<a href="/api/jobs/${encodeURIComponent(jobId)}/reports/failed">Download failure report</a>`);
  $('reportLinks').innerHTML = links.join('');
  log(`Finished. Created: ${summary.totalSuccess}; failed: ${summary.totalFailed}.`);
}

function listenToJob(id) {
  events = new EventSource(`/api/jobs/${id}/events`);
  events.onmessage = (message) => {
    const event = JSON.parse(message.data);
    if (event.type === 'log') log(event.line);
    if (event.type === 'progress') updateProgress(event.progress);
    if (event.type === 'finished') { finish(event.summary); events.close(); }
    if (event.type === 'error') { log(`ERROR: ${event.message}`); setStatus('Needs attention', 'error'); $('startButton').disabled = false; $('stopButton').disabled = true; events.close(); }
  };
}

$('runForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!tasks.length) { showValidation([{ row: 0, message: 'Choose a valid Excel file with at least one task.' }]); return; }
  $('logs').textContent = '';
  $('reportLinks').innerHTML = '';
  $('startButton').disabled = true;
  $('stopButton').disabled = false;
  setStatus('Running', 'running');
  updateProgress({ total: tasks.length, completed: 0, failed: 0, remaining: tasks.length, current: null });
  try {
    const response = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: $('siteUrl').value.trim(), username: $('username').value.trim(), password: $('password').value, tasks }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to start the run.');
    jobId = body.id;
    listenToJob(jobId);
  } catch (error) {
    log(`ERROR: ${error.message}`); setStatus('Needs attention', 'error'); $('startButton').disabled = false; $('stopButton').disabled = true;
  }
});

$('stopButton').addEventListener('click', async () => {
  if (!jobId) return;
  await fetch(`/api/jobs/${jobId}/stop`, { method: 'POST' });
  $('stopButton').disabled = true;
});
