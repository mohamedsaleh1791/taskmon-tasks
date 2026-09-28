/**
 * Logs in with the credentials the user entered in the app UI.
 * No storageState is read or written anywhere - this always performs
 * a real interactive login for this run only, using this user's own
 * account. Nothing about the session is ever saved to disk.
 */
async function login(page, { siteUrl, username, password }) {
  const baseUrl = siteUrl.replace(/\/+$/, '');
  const loginUrl = `${baseUrl}/auth/login`;

  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

  await page.locator('id=email').fill(username);
  await page.locator('id=password').fill(password);

  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.waitForLoadState('networkidle');

  // Basic sanity check: if we're still on the login page, login failed.
  if (page.url().includes('/auth/login')) {
    throw new Error(
      'Login failed. Please check the URL, username, and password.'
    );
  }
}

module.exports = { login };
