import {
  emailLayout,
  emailHeader,
  emailHeading,
  emailText,
  emailCard,
  emailButton,
  emailAlertFooter,
  htmlEscape,
  BRAND_COLOR,
  STATUS_COLORS,
} from "./components";

interface AlertTemplateParams {
  staffName: string;
  credentialType: string;
  credentialLabel: string;
  expirationDate: string;
  daysBeforeExpiration: number;
  dashboardLink: string;
}

export function buildAlertEmail(params: AlertTemplateParams): string {
  const urgencyMsg =
    params.daysBeforeExpiration <= 7
      ? "Expires this week. Renew immediately."
      : params.daysBeforeExpiration <= 30
        ? "Expiring soon. Schedule renewal now."
        : "Plan ahead for renewal.";

  return emailLayout({
    previewText: `${params.staffName}'s ${params.credentialType} expires in ${params.daysBeforeExpiration} days`,
    children: `
      ${emailHeader("COMPLIANCE ALERT")}
      ${emailCard({
        children: `
          ${emailHeading(`${htmlEscape(params.staffName)}'s ${htmlEscape(params.credentialType)} expires in ${params.daysBeforeExpiration} days`)}

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F4F5;border-radius:6px;padding:16px;margin:0 0 20px;">
            <tr><td>
              <p style="color:#000000;font-size:14px;margin:0 0 4px;"><strong>${htmlEscape(params.credentialLabel)}</strong></p>
              <p style="color:rgba(0,0,0,0.55);font-size:13px;margin:0 0 4px;">Expiration date: <strong>${params.expirationDate}</strong></p>
              <p style="color:${BRAND_COLOR};font-size:13px;margin:0;">${urgencyMsg}</p>
            </td></tr>
          </table>

          ${emailText("Renew at the state board website before the expiration date. Once renewed, upload the new certificate in the dashboard. Expired credentials can mean fines, license suspension, or a board investigation.")}

          ${emailButton({ href: params.dashboardLink, text: "View in dashboard" })}

          ${emailAlertFooter(false)}
        `,
      })}
    `,
  });
}

export function buildEscalationEmail(params: AlertTemplateParams): string {
  return emailLayout({
    previewText: `CREDENTIAL EXPIRED: ${params.staffName}'s ${params.credentialType} has expired`,
    children: `
      ${emailHeader("ESCALATION \u2014 CREDENTIAL EXPIRED")}
      ${emailCard({
        topBorder: STATUS_COLORS.expired,
        children: `
          ${emailHeading(`${htmlEscape(params.staffName)}'s ${htmlEscape(params.credentialType)} has expired`)}

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FCE8E5;border:1px solid ${STATUS_COLORS.expired};border-radius:6px;padding:16px;margin:0 0 20px;">
            <tr><td>
              <p style="color:#7A2A26;font-size:14px;margin:0 0 4px;"><strong>${htmlEscape(params.credentialLabel)}</strong></p>
              <p style="color:#7A2A26;font-size:13px;margin:0 0 4px;">Expired: <strong>${params.expirationDate}</strong></p>
              <p style="color:${STATUS_COLORS.expired};font-size:13px;font-weight:500;margin:0;">
                ${Math.abs(params.daysBeforeExpiration)} days past expiration. Renew immediately.
              </p>
            </td></tr>
          </table>

          ${emailText("This staff member cannot legally perform procedures that require this credential. That is a direct liability for your clinic. Expired credentials are the most common trigger for board investigations, fines, and licensing actions against med spas.")}

          ${emailButton({ href: params.dashboardLink, text: "View in dashboard", color: STATUS_COLORS.expired })}

          ${emailAlertFooter(true)}
        `,
      })}
    `,
  });
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
