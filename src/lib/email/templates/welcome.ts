import {
  emailLayout,
  emailHeader,
  emailHeading,
  emailText,
  emailCard,
  emailButton,
  emailFooter,
  htmlEscape,
} from "../components";

interface WelcomeEmailParams {
  clinicName: string;
  dashboardUrl: string;
  ownerFirstName: string;
}

export function buildWelcomeEmail(params: WelcomeEmailParams): string {
  const name = htmlEscape(params.ownerFirstName);
  const clinic = htmlEscape(params.clinicName);

  return emailLayout({
    previewText: `Your clinic "${clinic}" is registered. Your inspection-readiness scan is running now.`,
    children: `
      ${emailHeader("WELCOME")}
      ${emailCard({
        children: `
          ${emailHeading(`Welcome to ComplySpa, ${name}`)}
          ${emailText(`<strong>${clinic}</strong> is registered. Your inspection-readiness scan is running now.`)}
          ${emailText("Your dashboard will show every staff member's credential status, which items need renewal this month, and anything that needs your attention. It takes about a minute to review.")}
          ${emailButton({ href: params.dashboardUrl, text: "View your dashboard" })}
          <p style="color:rgba(0,0,0,0.55);font-size:13px;line-height:1.5;margin:0 0 16px;">
            Need help? Reply to this email or reach out at
            <a href="mailto:support@complyspa.com" style="color:#6E97A7;text-decoration:underline;">support@complyspa.com</a>.
          </p>
        `,
      })}
      ${emailFooter()}
    `,
  });
}
