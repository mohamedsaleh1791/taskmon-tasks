const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

function credentialsFilePath() {
  return path.join(app.getPath('userData'), 'saved-login.json');
}

/**
 * Saves siteUrl + username in plain JSON (low sensitivity, needed to
 * prefill the form) and the password encrypted via the OS keychain
 * (DPAPI on Windows, Keychain on macOS, libsecret on Linux).
 * Does nothing (and returns ok:false) if the OS doesn't support
 * encryption, rather than silently falling back to plaintext.
 */
function saveCredentials({ siteUrl, username, password }) {
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, reason: 'OS-level encryption is not available on this machine.' };
  }

  const encryptedPassword = safeStorage.encryptString(password).toString('base64');

  const data = { siteUrl, username, encryptedPassword };
  fs.writeFileSync(credentialsFilePath(), JSON.stringify(data), { encoding: 'utf-8' });

  return { ok: true };
}

/**
 * Returns { siteUrl, username, password } if a saved login exists and
 * can be decrypted on this machine, otherwise null.
 */
function loadCredentials() {
  const filePath = credentialsFilePath();
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);

    if (!data.encryptedPassword || !safeStorage.isEncryptionAvailable()) return null;

    const password = safeStorage.decryptString(Buffer.from(data.encryptedPassword, 'base64'));

    return { siteUrl: data.siteUrl, username: data.username, password };
  } catch {
    // Corrupt file or undecryptable (e.g. moved to a different machine/user) - treat as none saved.
    return null;
  }
}

function clearCredentials() {
  const filePath = credentialsFilePath();
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return { ok: true };
}

function hasSavedCredentials() {
  return fs.existsSync(credentialsFilePath());
}

module.exports = { saveCredentials, loadCredentials, clearCredentials, hasSavedCredentials };
