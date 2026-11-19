const ADMIN_TOKEN_KEY = 'ccl_admin_token';

export function getStoredAdminToken(): string | null {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string | undefined | null): void {
  if (!token) return;
  try {
    window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    // Ignore storage errors in restricted environments
  }
}

export function clearStoredAdminToken(): void {
  try {
    window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function getAdminAuthHeaders(): Record<string, string> {
  const token = getStoredAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
