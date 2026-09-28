const path = require('path');
const fs = require('fs');

const TASKS_URL_PATH = '/dashboard/tasks';

function splitDuration(duration) {
  const [hours = '0', minutes = '0', seconds = '0'] = String(duration).split(':');
  return { hours, minutes, seconds };
}

async function goToTasksPage(page, siteUrl) {
  const baseUrl = siteUrl.replace(/\/+$/, '');
  await page.goto(`${baseUrl}${TASKS_URL_PATH}`, { waitUntil: 'domcontentloaded' });
}

/**
 * Creates a single task on the page. Mirrors the original
 * createTasks.spec.ts locator sequence exactly (account selection via
 * click + text match, dynamic-field wait on #task-item-id, duration
 * split into h/m/s fields). On failure, captures a screenshot and
 * returns a structured error result instead of swallowing it silently.
 */
async function createTask(page, task, { screenshotsDir }) {
  try {
    await page.getByRole('button', { name: /new task/i }).click();
    await page.getByText('Select account').waitFor();

    // =========================
    // Account (format: "Account #123")
    // =========================
    // await page.getByText('Select account').click();
    const accountButton = page
  .locator('label', { hasText: /^Account/ })
  .locator('xpath=following::button[@aria-haspopup="listbox"][1]');

await accountButton.click();
    await page.getByRole('option').filter({ hasText: task.Account }).first().click();

    // =========================
    // Wait for dynamic fields to appear
    // =========================
    const taskIdField = page.locator('#task-item-id');
    await taskIdField.waitFor({ state: 'visible', timeout: 15000 });

    // =========================
    // Task ID
    // =========================
    await page.locator('#task-item-id').fill(String(task.TaskID));

    // =========================
    // Actual Duration (format: "00:00:00")
    // =========================
    const actual = splitDuration(task.ActualDuration);
    await page.locator('#task-actual-duration-h').fill(actual.hours);
    await page.locator('#task-actual-duration-m').fill(actual.minutes);
    await page.locator('#task-actual-duration-s').fill(actual.seconds);

    // =========================
    // Reported Duration
    // =========================
    const reported = splitDuration(task.ReportedDuration);
    await page.locator('#task-reported-duration-h').fill(reported.hours);
    await page.locator('#task-reported-duration-m').fill(reported.minutes);
    await page.locator('#task-reported-duration-s').fill(reported.seconds);

    // =========================
    // Hourly Rate
    // =========================
    await page.locator('#task-rate').fill(String(task.HourlyRate));

    // =========================
    // Notes
    // =========================
    await page.locator('#task-notes').fill(task.Notes ?? '');

    // =========================
    // Create
    // =========================
    const createButton = page.getByRole('button', { name: /^Create$/ });
    await createButton.waitFor();
    await createButton.click();

    await page.waitForTimeout(1500);

    return { taskId: task.TaskID, success: true };
  } catch (error) {
    const screenshotPath = await captureFailureScreenshot(page, task.TaskID, screenshotsDir);
    return {
      taskId: task.TaskID,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      screenshotPath,
      timestamp: new Date().toISOString(),
    };
  }
}

async function captureFailureScreenshot(page, taskId, screenshotsDir) {
  try {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    const safeId = String(taskId).replace(/[^a-z0-9_-]/gi, '_');
    const filename = `task-${safeId}-${Date.now()}.png`;
    const filePath = path.join(screenshotsDir, filename);
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  } catch {
    return null;
  }
}

module.exports = { goToTasksPage, createTask };
