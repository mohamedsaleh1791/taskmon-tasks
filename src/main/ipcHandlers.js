const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { runAutomation } = require('../automation/runController');
const {
  saveCredentials,
  loadCredentials,
  clearCredentials,
  hasSavedCredentials,
} = require('./credentialStore');

let stopRequested = false;

function registerIpcHandlers(getWindow) {
  ipcMain.handle('credentials:save', async (_event, { siteUrl, username, password }) =>
    saveCredentials({ siteUrl, username, password })
  );

  ipcMain.handle('credentials:load', async () => loadCredentials());

  ipcMain.handle('credentials:clear', async () => clearCredentials());

  ipcMain.handle('credentials:has-saved', async () => hasSavedCredentials());

  ipcMain.handle('select-excel-file', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Select Tasks Excel File',
      properties: ['openFile'],
      filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('start-automation', async (_event, config) => {
    stopRequested = false;
    const win = getWindow();

    const userDataDir = app.getPath('userData');
    const screenshotsDir = path.join(userDataDir, 'screenshots');
    const reportsDir = path.join(userDataDir, 'reports');
    [screenshotsDir, reportsDir].forEach((dir) => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    try {
      const summary = await runAutomation({
        siteUrl: config.siteUrl,
        username: config.username,
        password: config.password,
        excelFilePath: config.excelFilePath,
        screenshotsDir,
        reportsDir,
        onProgress: (progress) => win.webContents.send('automation:progress', progress),
        onLog: (line) => win.webContents.send('automation:log', line),
        shouldStop: () => stopRequested,
      });

      win.webContents.send('automation:finished', {
        totalSuccess: summary.reportSummary.totalSuccess,
        totalFailed: summary.reportSummary.totalFailed,
        failedReportPath: summary.reportSummary.failedPath,
        successReportPath: summary.reportSummary.successPath,
        validationErrorCount: summary.validationErrors.length,
      });

      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      win.webContents.send('automation:error', message);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('stop-automation', async () => {
    stopRequested = true;
    return { ok: true };
  });
}

module.exports = { registerIpcHandlers };
