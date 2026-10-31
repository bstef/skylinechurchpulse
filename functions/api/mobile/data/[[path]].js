// Mobile routes reuse the browser handlers; api/_middleware.js swaps cookie
// sign-in for bearer-token sign-in on everything under /api/mobile/.
export { onRequest } from '../../data/[[path]].js';
