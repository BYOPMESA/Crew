export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || body?.issues?.[0]?.message || body?.error || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error;
    this.issues = body?.issues;
  }
}

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { message: 'You appear to be offline. Check your connection and try again.' });
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

let cachedMe;
/** The signed-in user, or null. Cached for the page session; call clearMe() after login/logout. */
export async function getMe() {
  if (cachedMe !== undefined) return cachedMe;
  try {
    cachedMe = await api('GET', '/me');
  } catch (err) {
    if (err.status === 401) cachedMe = null;
    else throw err;
  }
  return cachedMe;
}
export const clearMe = () => {
  cachedMe = undefined;
};
