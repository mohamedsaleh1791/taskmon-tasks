const XLSX = require('xlsx');

const REQUIRED_COLUMNS = [
  'TaskID',
  'Account',
  'ActualDuration',
  'ReportedDuration',
  'HourlyRate',
  'Notes',
];

// Duration format: 00:00:00
const DURATION_PATTERN = /^\d{1,2}:\d{2}:\d{2}$/;
// Account format: "Account #123" (any number of digits)
const ACCOUNT_PATTERN = /^Account\s*#\s*\d+$/i;

/**
 * Reads the Excel file and returns { rows, errors }.
 * `rows` contains only rows that passed validation, tagged with their
 * original Excel row number for traceability.
 * `errors` contains one entry per bad row, with enough detail to explain
 * to a non-technical user exactly what to fix.
 */
function readAndValidateTasks(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (raw.length === 0) {
    return { rows: [], errors: [{ row: 0, message: 'The Excel file is empty.' }] };
  }

  const headerErrors = validateHeaders(raw[0]);
  if (headerErrors.length > 0) {
    return { rows: [], errors: headerErrors };
  }

  return validateTaskRows(raw);
}

function validateTaskRows(raw) {
  const headerErrors = validateHeaders(raw[0] || {});
  if (headerErrors.length > 0) {
    return { rows: [], errors: headerErrors };
  }

  const rows = [];
  const errors = [];

  raw.forEach((record, index) => {
    const excelRowNumber = index + 2; // +1 for header, +1 for 0-index
    const rowErrors = validateRow(record);

    if (rowErrors.length > 0) {
      errors.push({
        row: excelRowNumber,
        taskId: record.TaskID || '(missing)',
        message: rowErrors.join('; '),
      });
    } else {
      rows.push({
        TaskID: String(record.TaskID).trim(),
        Account: String(record.Account).trim(),
        ActualDuration: String(record.ActualDuration).trim(),
        ReportedDuration: String(record.ReportedDuration).trim(),
        HourlyRate: Number(record.HourlyRate),
        Notes: String(record.Notes ?? '').trim(),
      });
    }
  });

  return { rows, errors };
}

function validateHeaders(firstRow) {
  const presentColumns = Object.keys(firstRow);
  const missing = REQUIRED_COLUMNS.filter((col) => !presentColumns.includes(col));

  if (missing.length > 0) {
    return [
      {
        row: 1,
        message: `Missing required column(s): ${missing.join(', ')}. Expected columns: ${REQUIRED_COLUMNS.join(', ')}.`,
      },
    ];
  }
  return [];
}

function validateRow(record) {
  const errors = [];

  const isEmptyRow = REQUIRED_COLUMNS.every(
    (col) => record[col] === '' || record[col] === undefined || record[col] === null
  );
  if (isEmptyRow) {
    errors.push('Row is empty');
    return errors;
  }

  if (!record.TaskID || String(record.TaskID).trim() === '') {
    errors.push('TaskID is missing');
  }

  if (!ACCOUNT_PATTERN.test(String(record.Account).trim())) {
    errors.push(`Account must look like "Account #123" (got "${record.Account}")`);
  }

  if (!DURATION_PATTERN.test(String(record.ActualDuration).trim())) {
    errors.push(`ActualDuration must be in 00:00:00 format (got "${record.ActualDuration}")`);
  }

  if (!DURATION_PATTERN.test(String(record.ReportedDuration).trim())) {
    errors.push(`ReportedDuration must be in 00:00:00 format (got "${record.ReportedDuration}")`);
  }

  const rate = Number(record.HourlyRate);
  if (record.HourlyRate === '' || Number.isNaN(rate)) {
    errors.push(`HourlyRate must be a number (got "${record.HourlyRate}")`);
  }

  return errors;
}

module.exports = { readAndValidateTasks, validateTaskRows, REQUIRED_COLUMNS };
