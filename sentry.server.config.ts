import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://65e972effe4ff5a0b95ab3b8091ecd7e@o4511731049234432.ingest.us.sentry.io/4511779368271872",
  environment: process.env.NODE_ENV,
  enabled: process.env.SENTRY_ENABLED !== "false",
  tracesSampleRate: 0.1,
  sampleRate: 1.0,
  normalizeDepth: 10,
  beforeSend(event) {
    if (event.level === "info" || event.level === "debug" || event.level === "log") {
      event.level = "warning";
    }
    if (!event.tags?.runtime) {
      event.tags = { ...event.tags, runtime: "server" };
    }
    return event;
  },
});
