import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://65e972effe4ff5a0b95ab3b8091ecd7e@o4511731049234432.ingest.us.sentry.io/4511779368271872",
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === "production",
});
