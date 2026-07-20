/**
 * Email and SMS templates for credential expiration alerts.
 *
 * These templates are plain strings (not React elements) because:
 * 1. The Edge Function runs on Deno, not Node.js — no React rendering available
 * 2. Resend accepts raw HTML strings directly
 * 3. A React Email workflow (resend/react-email) would add unnecessary complexity
 *    for a solo founder maintaining 4 templates
 */

function htmlEscape(str: string): string {
  const map: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#x27;"
  };
  return str.replace(/[&<>\"']/g, (ch) => map[ch] || ch);
}

interface AlertTemplateParams {
  staffName: string;
  credentialType: string;
  credentialLabel: string;
  expirationDate: string;
  daysBeforeExpiration: number;
  dashboardLink: string;
}

export function buildAlertEmail(params: AlertTemplateParams): string {
  const urgency =
    params.daysBeforeExpiration <= 7
      ? "Expires this week — renew immediately."
      : params.daysBeforeExpiration <= 30
        ? "Expiring soon — schedule renewal now."
        : "Plan ahead for renewal.";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #FFF8F2; padding: 24px; margin: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; margin: 0 auto;">
    <tr>
      <td style="background: #FFFFFF; border: 1px solid #D9B7A7; border-radius: 8px; padding: 32px 24px;">
        <p style="color: #8B7D78; font-size: 13px; margin: 0 0 8px;">COMPLIANCE ALERT</p>
        <h2 style="color: #3D2A25; font-size: 20px; font-weight: 600; margin: 0 0 16px;">
          ${htmlEscape(params.staffName)}'s ${htmlEscape(params.credentialType)} expires in ${params.daysBeforeExpiration} days
        </h2>

        <table width="100%" cellpadding="0" cellspacing="0" style="background: #F6E3D6; border-radius: 6px; padding: 16px; margin: 0 0 20px;">
          <tr>
            <td>
              <p style="color: #3D2A25; font-size: 14px; margin: 0 0 4px;">
                <strong>${htmlEscape(params.credentialLabel)}</strong>
              </p>
              <p style="color: #8B7D78; font-size: 13px; margin: 0 0 8px;">
                Expiration date: <strong>${params.expirationDate}</strong>
              </p>
              <p style="color: #9C6B5D; font-size: 13px; margin: 0;">
                ${urgency}
              </p>
            </td>
          </tr>
        </table>

        <p style="color: #3D2A25; font-size: 14px; line-height: 1.5; margin: 0 0 20px;">
          Visit your state board website to renew this credential before the expiration date. Upload the new certificate in the dashboard once complete. Lapsed credentials can result in fines, license suspension, or board investigations.
        </p>

        <a href="${params.dashboardLink}" style="display: inline-block; background: #9C6B5D; color: #FFFFFF; font-size: 14px; font-weight: 500; text-decoration: none; padding: 10px 20px; border-radius: 6px;">
          View in dashboard
        </a>

        <hr style="border: none; border-top: 1px solid #D9B7A7; margin: 24px 0 16px;">

        <p style="color: #8B7D78; font-size: 11px; line-height: 1.5; margin: 0;">
          This is an automated alert from your compliance tracker. You received this because you configured expiration reminders for your clinic's credentials. Alerts are sent at 90, 60, 30, and 7 days before each expiration.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildEscalationEmail(params: AlertTemplateParams): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #FFF8F2; padding: 24px; margin: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; margin: 0 auto;">
    <tr>
      <td style="background: #FFFFFF; border: 1px solid #D9B7A7; border-top: 4px solid #B8443A; border-radius: 0 0 8px 8px; padding: 32px 24px;">
        <p style="color: #B8443A; font-size: 13px; font-weight: 600; margin: 0 0 8px;">ESCALATION — CREDENTIAL EXPIRED</p>
        <h2 style="color: #3D2A25; font-size: 20px; font-weight: 600; margin: 0 0 16px;">
          ${htmlEscape(params.staffName)}'s ${htmlEscape(params.credentialType)} has EXPIRED
        </h2>

        <table width="100%" cellpadding="0" cellspacing="0" style="background: #FCE8E5; border: 1px solid #B8443A; border-radius: 6px; padding: 16px; margin: 0 0 20px;">
          <tr>
            <td>
              <p style="color: #7A2A26; font-size: 14px; margin: 0 0 4px;">
                <strong>${htmlEscape(params.credentialLabel)}</strong>
              </p>
              <p style="color: #7A2A26; font-size: 13px; margin: 0 0 8px;">
                Expired: <strong>${params.expirationDate}</strong>
              </p>
              <p style="color: #B8443A; font-size: 13px; font-weight: 500; margin: 0;">
                This credential has been expired for ${Math.abs(params.daysBeforeExpiration)} days and must be renewed immediately.
              </p>
            </td>
          </tr>
        </table>

        <p style="color: #3D2A25; font-size: 14px; line-height: 1.5; margin: 0 0 20px;">
          An expired credential means the staff member cannot legally perform procedures that require it. This is the #1 cause of board investigations, fines, and licensing actions for med spas.
        </p>

        <a href="${params.dashboardLink}" style="display: inline-block; background: #B8443A; color: #FFFFFF; font-size: 14px; font-weight: 500; text-decoration: none; padding: 10px 20px; border-radius: 6px;">
          View in dashboard
        </a>

        <hr style="border: none; border-top: 1px solid #D9B7A7; margin: 24px 0 16px;">

        <p style="color: #8B7D78; font-size: 11px; line-height: 1.5; margin: 0;">
          This is an automated escalation alert. Previous alerts were sent at 90, 60, 30, and 7 days before expiration. If you have already renewed this credential, update the expiration date in the dashboard to stop receiving alerts.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildAlertSubject(
  staffName: string,
  credentialType: string,
  daysBeforeExpiration: number,
): string {
  if (daysBeforeExpiration < 0) {
    return `CREDENTIAL EXPIRED: ${staffName}'s ${credentialType}`;
  }
  return `${staffName}'s ${credentialType} expires in ${daysBeforeExpiration} days`;
}

export function buildSmsBody(
  staffName: string,
  credentialType: string,
  expirationDate: string,
  daysBeforeExpiration: number,
): string {
  if (daysBeforeExpiration < 0) {
    return `COMPLIANCE ALERT: ${staffName}'s ${credentialType} EXPIRED on ${expirationDate}. Renew immediately.`;
  }
  return `Compliance alert: ${staffName}'s ${credentialType} expires ${expirationDate} (${daysBeforeExpiration} days). Renew at your state board website.`;
}
