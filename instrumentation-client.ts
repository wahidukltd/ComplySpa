import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://65e972effe4ff5a0b95ab3b8091ecd7e@o4511731049234432.ingest.us.sentry.io/4511779368271872",
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === "production",
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
