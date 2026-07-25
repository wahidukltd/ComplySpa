import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    process.on("unhandledRejection", (reason) => {
      Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)), {
        level: "error",
        tags: { source: "unhandledRejection" },
      });
    });

    process.on("uncaughtException", (error) => {
      Sentry.captureException(error, {
        level: "fatal",
        tags: { source: "uncaughtException" },
      });
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
