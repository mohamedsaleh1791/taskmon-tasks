const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

/**
 * Writes FailedTasks.xlsx (TaskID, Error Message, Timestamp, Screenshot)
 * and a SuccessTasks.xlsx summary into the given reports directory.
 * Returns the file paths written (failedPath is null if there were no failures).
 */
function generateReports({ results, reportsDir }) {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const successResults = results.filter((r) => r.success);
  const failedResults = results.filter((r) => !r.success);

  let failedPath = null;
  if (failedResults.length > 0) {
    const failedSheet = XLSX.utils.json_to_sheet(
      failedResults.map((r) => ({
        TaskID: r.taskId,
        'Error Message': r.error,
        Timestamp: r.timestamp,
        Screenshot: r.screenshotPath || '',
      }))
    );
    const failedWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(failedWb, failedSheet, 'FailedTasks');
    failedPath = path.join(reportsDir, `FailedTasks-${timestamp}.xlsx`);
    XLSX.writeFile(failedWb, failedPath);
  }

  let successPath = null;
  if (successResults.length > 0) {
    const successSheet = XLSX.utils.json_to_sheet(
      successResults.map((r) => ({ TaskID: r.taskId, Status: 'Created' }))
    );
    const successWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(successWb, successSheet, 'SuccessTasks');
    successPath = path.join(reportsDir, `SuccessTasks-${timestamp}.xlsx`);
    XLSX.writeFile(successWb, successPath);
  }

  return {
    failedPath,
    successPath,
    totalSuccess: successResults.length,
    totalFailed: failedResults.length,
  };
}

module.exports = { generateReports };
