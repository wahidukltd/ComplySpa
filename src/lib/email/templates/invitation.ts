import {
  emailLayout,
  emailHeader,
  emailHeading,
  emailText,
  emailCard,
  emailButton,
  emailFooter,
  htmlEscape,
  BRAND_COLOR,
} from "../components";

interface InvitationEmailParams {
  clinicName: string;
  signUpUrl: string;
}

export function buildInvitationEmail(params: InvitationEmailParams): string {
  const clinic = htmlEscape(params.clinicName);

  return emailLayout({
    previewText: `${clinic} invited you to ComplySpa.`,
    children: `
      ${emailHeader("INVITATION")}
      ${emailCard({
        topBorder: BRAND_COLOR,
        children: `
          ${emailHeading(`You've been invited to ComplySpa`)}
          ${emailText(`<strong>${clinic}</strong> has invited you to join their compliance workspace.`)}
          ${emailText("Sign up with this email address — your account links to the clinic automatically. Once you're in, you'll see credential tracking, expiration alerts, and the team's compliance status.")}
          ${emailButton({ href: params.signUpUrl, text: "Create your account" })}
          <p style="color:rgba(0,0,0,0.55);font-size:13px;line-height:1.5;margin:0 0 16px;">
            Already have an account? Just sign in — you'll be linked the same way.
          </p>
        `,
      })}
      ${emailFooter()}
    `,
  });
}

export function buildInvitationSubject(): string {
  return "You've been invited to ComplySpa";
}
