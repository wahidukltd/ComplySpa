import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "Med Spa Compliance Tracker — Credentials, Alerts, Audit Readiness",
    template: "%s | Med Spa Compliance",
  },
  description:
    "Track staff credentials, get automated expiration alerts, and generate audit-ready compliance reports. Purpose-built for independent medical spas.",
  keywords: [
    "med spa compliance",
    "credential tracking",
    "license expiration alerts",
    "medical spa software",
    "med spa audit report",
    "inspection readiness",
  ],
  robots: { index: true, follow: true },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Med Spa Compliance",
    title: "Med Spa Compliance Tracker — Credentials, Alerts, Audit Readiness",
    description: "Track credentials, never miss an expiration, pass audits confidently.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <ClerkProvider
        signInFallbackRedirectUrl="/dashboard"
        signUpFallbackRedirectUrl="/onboarding"
        afterSignOutUrl="/sign-in"
      >
        <body className="min-h-full bg-background text-foreground">
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--card)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
              },
            }}
          />
        </body>
      </ClerkProvider>
    </html>
  );
}
