import { sendReport } from '../send-report-email.js';
export const onRequestPost = context => sendReport(context, { requireSameOrigin: false });
