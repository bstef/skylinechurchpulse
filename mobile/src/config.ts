// Build-time settings. Defaults point at the staging (preview) deployment; set the
// EXPO_PUBLIC_* variables for production builds. None of these values are secrets.
const TEAM_DOMAIN = process.env.EXPO_PUBLIC_ACCESS_TEAM_DOMAIN || 'peacockengr.cloudflareaccess.com';
const CLIENT_ID = process.env.EXPO_PUBLIC_ACCESS_MOBILE_CLIENT_ID || 'bb39f8e5c6f0929db4bf8bf50b138c6ff347f2d78f20c73b94e4f7078816864d';

export const config = {
  apiBase: process.env.EXPO_PUBLIC_PULSE_API || 'https://claude-inspiring-noether-ejq.skylinechurchpulse.pages.dev',
  clientId: CLIENT_ID,
  issuer: `https://${TEAM_DOMAIN}/cdn-cgi/access/sso/oidc/${CLIENT_ID}`,
  // Must match a Redirect URL on the Access for SaaS (OIDC) application.
  scheme: 'skylinepulse',
  redirectPath: 'auth',
};
