// version.ts — the API version the website checks. Bump API_VERSION (yyyymmdd) whenever the
// website starts relying on a new server feature; the admin panel then warns if Railway is still
// running an older server (e.g. a failed deploy) instead of failing with "Route not found".
export const API_VERSION = 20261118;
