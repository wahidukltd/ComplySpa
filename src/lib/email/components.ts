export const FONT_FAMILY = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
export const BRAND_COLOR = "#6E97A7";
export const TEXT_COLOR = "#000000";
export const MUTED_COLOR = "rgba(0,0,0,0.55)";
export const DIM_COLOR = "rgba(0,0,0,0.45)";
export const BORDER_COLOR = "rgba(0,0,0,0.12)";
export const BG_LIGHT = "#F8FAFB";

export const STATUS_COLORS = {
  valid: "#4A8C5C",
  expiring: "#C2853A",
  expired: "#B8443A",
} as const;

export function htmlEscape(str: string): string {
  const map: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;",
  };
  return str.replace(/[&<>"']/g, (ch) => map[ch] || ch);
}

interface LayoutOptions {
  previewText?: string;
  children: string;
}

export function emailLayout(opts: LayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  ${opts.previewText ? `<meta name="x-apple-disable-message-reformatting">
  <style>body,table,td,p,a,li,blockquote{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}@media only screen and (max-width:560px){.email-table{width:100%!important;}.email-pad{padding:24px 20px!important;}.email-content{padding:0 20px!important;}}</style>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>@media(prefers-color-scheme:dark){.email-body{background-color:#FFFFFF!important;}.email-card{background-color:#FFFFFF!important;}}</style>` : ""}
</head>
<body class="email-body" style="margin:0;padding:0;background-color:#FFFFFF;font-family:${FONT_FAMILY};-webkit-font-smoothing:antialiased;">
  ${opts.previewText ? `<div style="display:none;font-size:1px;color:#FFFFFF;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${htmlEscape(opts.previewText)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="email-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;">
          ${opts.children}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

interface CardOptions {
  topBorder?: string;
  children: string;
}

export function emailCard(opts: CardOptions): string {
  const borderTop = opts.topBorder
    ? `border-top:4px solid ${opts.topBorder};`
    : "";
  return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-card" style="background:#FFFFFF;border:1px solid ${BORDER_COLOR};${borderTop}border-radius:0 0 8px 8px;">
  <tr><td class="email-pad" style="padding:32px 28px;">
    ${opts.children}
  </td></tr>
</table></td></tr>`;
}

export function emailCardNoBorder(children: string): string {
  return `<tr><td style="padding:0;">
  ${children}
</td></tr>`;
}

export function emailHeader(label: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="width:4px;height:28px;background:${BRAND_COLOR};"></td>
    <td style="padding-left:12px;">
      <p style="margin:0;font-size:13px;color:${MUTED_COLOR};letter-spacing:0.5px;">${htmlEscape(label)}</p>
    </td>
  </tr>
</table>`;
}

export function emailHeading(text: string): string {
  return `<h2 style="color:${TEXT_COLOR};font-size:20px;font-weight:600;margin:12px 0 16px;">${htmlEscape(text)}</h2>`;
}

export function emailText(text: string): string {
  return `<p style="color:${TEXT_COLOR};font-size:14px;line-height:1.6;margin:0 0 16px;">${text}</p>`;
}

export function emailSmallText(text: string): string {
  return `<p style="color:${DIM_COLOR};font-size:12px;line-height:1.5;margin:0;">${text}</p>`;
}

interface ButtonOptions {
  href: string;
  text: string;
  color?: string;
}

export function emailButton(opts: ButtonOptions): string {
  const bg = opts.color || BRAND_COLOR;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
  <tr>
    <td align="center" style="border-radius:6px;background:${bg};">
      <a href="${htmlEscape(opts.href)}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:500;color:#FFFFFF;text-decoration:none;border-radius:6px;background:${bg};mso-hide:none;">${htmlEscape(opts.text)}</a>
    </td>
  </tr>
</table>`;
}

export function emailDivider(): string {
  return `<tr><td style="padding:0;"><hr style="border:none;border-top:1px solid ${BORDER_COLOR};margin:0 0 20px;"></td></tr>`;
}

export function emailSpacer(height: number): string {
  return `<tr><td style="padding:0;height:${height}px;font-size:1px;line-height:1px;">&nbsp;</td></tr>`;
}

interface InfoRowParams {
  label: string;
  value: string;
  mono?: boolean;
}

export function emailInfoRow(params: InfoRowParams): string {
  const valStyle = params.mono
    ? `font-family:monospace;font-size:12px;`
    : "";
  return `<tr><td style="padding:4px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="color:${MUTED_COLOR};font-size:13px;width:100px;vertical-align:top;">${htmlEscape(params.label)}</td>
    <td style="color:${TEXT_COLOR};font-size:13px;font-weight:500;${valStyle}">${params.value}</td>
  </tr></table></td></tr>`;
}

export function emailInfoTable(rows: InfoRowParams[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG_LIGHT};border-radius:6px;padding:16px;margin:0 0 20px;">
    ${rows.map((r) => emailInfoRow(r)).join("")}
  </table>`;
}

export function emailFooter(): string {
  return `<tr><td style="padding:16px 0 0;">
  <p style="color:${DIM_COLOR};font-size:11px;line-height:1.5;margin:0 0 4px;">
    ComplySpa — Med Spa Compliance
  </p>
  <p style="color:${DIM_COLOR};font-size:11px;line-height:1.5;margin:0;">
    This is an automated message. Replies to this email are not monitored.
  </p>
</td></tr>`;
}

export function emailAlertFooter(isEscalation: boolean): string {
  const msg = isEscalation
    ? "This is an automated escalation alert. If you have already renewed this credential, update it in the dashboard to stop receiving alerts."
    : "This is an automated alert from your compliance tracker. Alerts are sent at 90, 60, 30, and 7 days before each expiration.";
  return `<tr><td style="padding:16px 0 0;">
  <hr style="border:none;border-top:1px solid ${BORDER_COLOR};margin:0 0 16px;">
  <p style="color:${DIM_COLOR};font-size:11px;line-height:1.5;margin:0;">${msg}</p>
</td></tr>`;
}
