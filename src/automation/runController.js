const { launchBrowser } = require('./browserManager');
const { login } = require('./loginService');
const { goToTasksPage, createTask } = require('./taskCreationService');
const { readAndValidateTasks, validateTaskRows } = require('../services/excelService');
const { generateReports } = require('../services/reportService');
const { createLogger } = require('../utils/logger');

/**
 * Runs a full automation session for one user.
 * Everything (browser, credentials, results) is scoped to this single
 * call - nothing persists between runs or between users.
 */
async function runAutomation({
  siteUrl,
  username,
  password,
  excelFilePath,
  tasks,
  headless,
  screenshotsDir,
  reportsDir,
  onProgress,
  onLog,
  shouldStop, // () => boolean
}) {
  const log = createLogger(onLog);
  let browser;

  try {
    log('Validating Excel file...');
    const { rows, errors } = tasks
      ? validateTaskRows(tasks)
      : readAndValidateTasks(excelFilePath);

    if (errors.length > 0) {
      errors.forEach((e) =>
        log(`Validation issue - row ${e.row} (${e.taskId ?? ''}): ${e.message}`)
      );
    }

    if (rows.length === 0) {
      throw new Error('No valid task rows found in the Excel file. Fix the issues above and try again.');
    }

    const total = rows.length;
    onProgress({ total, completed: 0, failed: 0, current: null, remaining: total });

    log('Launching browser...');
    const session = await launchBrowser({ headless: Boolean(headless) });
    browser = session.browser;
    const { page } = session;

    log('Logging in...');
    await login(page, { siteUrl, username, password });
    log('Login successful.');

    await goToTasksPage(page, siteUrl);

    const results = [];

    for (let i = 0; i < rows.length; i++) {
      if (shouldStop && shouldStop()) {
        log('Stop requested - halting before next task.');
        break;
      }

      const task = rows[i];
      log(`Creating Task ${task.TaskID}...`);

      const result = await createTask(page, task, { screenshotsDir });
      results.push(result);

      if (result.success) {
        log(`Task ${task.TaskID} created successfully.`);
      } else {
        log(`Task ${task.TaskID} FAILED: ${result.error}`);
      }

      const completed = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      onProgress({
        total,
        completed,
        failed,
        current: task.TaskID,
        remaining: total - results.length,
      });
    }

    log('Generating reports...');
    const reportSummary = generateReports({ results, reportsDir });

    log(
      `Run finished. Success: ${reportSummary.totalSuccess}, Failed: ${reportSummary.totalFailed}.`
    );

    return { results, reportSummary, validationErrors: errors };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { runAutomation };
