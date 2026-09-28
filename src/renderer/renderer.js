let selectedFilePath = null;

const siteUrlInput = document.getElementById('siteUrl');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const rememberMeCheckbox = document.getElementById('rememberMe');
const forgetMeBtn = document.getElementById('forgetMeBtn');
const selectedFileName = document.getElementById('selectedFileName');
const selectFileBtn = document.getElementById('selectFileBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const logPanel = document.getElementById('logPanel');

const pTotal = document.getElementById('pTotal');
const pCompleted = document.getElementById('pCompleted');
const pFailed = document.getElementById('pFailed');
const pRemaining = document.getElementById('pRemaining');
const pCurrent = document.getElementById('pCurrent');

function appendLog(line) {
  logPanel.textContent += line + '\n';
  logPanel.scrollTop = logPanel.scrollHeight;
}

function updateProgress(p) {
  pTotal.textContent = p.total;
  pCompleted.textContent = p.completed;
  pFailed.textContent = p.failed;
  pRemaining.textContent = p.remaining;
  pCurrent.textContent = p.current ?? '-';
}

function updateStartEnabled() {
  startBtn.disabled = !(selectedFilePath && siteUrlInput.value && usernameInput.value && passwordInput.value);
}

[siteUrlInput, usernameInput, passwordInput].forEach((el) =>
  el.addEventListener('input', updateStartEnabled)
);

async function prefillSavedLogin() {
  const saved = await window.api.loadCredentials();
  if (saved) {
    siteUrlInput.value = saved.siteUrl || siteUrlInput.value;
    usernameInput.value = saved.username || '';
    passwordInput.value = saved.password || '';
    rememberMeCheckbox.checked = true;
    forgetMeBtn.hidden = false;
    updateStartEnabled();
  } else {
    forgetMeBtn.hidden = !(await window.api.hasSavedCredentials());
  }
}

forgetMeBtn.addEventListener('click', async () => {
  await window.api.clearCredentials();
  rememberMeCheckbox.checked = false;
  forgetMeBtn.hidden = true;
  appendLog('Saved login cleared.');
});

prefillSavedLogin();

selectFileBtn.addEventListener('click', async () => {
  const filePath = await window.api.selectExcelFile();
  if (filePath) {
    selectedFilePath = filePath;
    selectedFileName.textContent = filePath;
    updateStartEnabled();
  }
});

startBtn.addEventListener('click', async () => {
  logPanel.textContent = '';
  startBtn.disabled = true;
  stopBtn.disabled = false;

  const config = {
    siteUrl: siteUrlInput.value.trim(),
    username: usernameInput.value.trim(),
    password: passwordInput.value,
    excelFilePath: selectedFilePath,
  };

  if (rememberMeCheckbox.checked) {
    const saveResult = await window.api.saveCredentials(config);
    if (saveResult.ok) {
      forgetMeBtn.hidden = false;
    } else {
      appendLog(`Could not save login: ${saveResult.reason}`);
    }
  } else {
    await window.api.clearCredentials();
    forgetMeBtn.hidden = true;
  }

  const result = await window.api.startAutomation(config);
  if (!result.ok) {
    appendLog(`Run stopped due to error: ${result.error}`);
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
});

stopBtn.addEventListener('click', async () => {
  appendLog('Stop requested...');
  await window.api.stopAutomation();
  stopBtn.disabled = true;
});

window.api.onProgress(updateProgress);
window.api.onLog(appendLog);
window.api.onError((message) => appendLog(`ERROR: ${message}`));
window.api.onFinished((summary) => {
  appendLog(
    `Done. Success: ${summary.totalSuccess}, Failed: ${summary.totalFailed}.` +
      (summary.failedReportPath ? ` Failed report: ${summary.failedReportPath}` : '')
  );
});
