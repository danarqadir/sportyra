// Sentry error monitoring - only initializes when DSN is provided
// Does nothing in development or when DSN is not set

let sentryInitialized = false;

export function initSentry() {
  if (typeof window === "undefined") return;
  if (sentryInitialized) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || dsn.trim() === "") {
    if (import.meta.env.DEV) {
      console.log("[Sentry] DSN not configured - error monitoring disabled");
    }
    return;
  }

  // Dynamic import to avoid bundle size when not used
  import("@sentry/react").then((Sentry) => {
    Sentry.init({
      dsn,
      environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || (import.meta.env.PROD ? "production" : "development"),
      release: import.meta.env.VITE_APP_VERSION || "unknown",
      // Performance monitoring (optional)
      tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
      // Session replay (optional)
      replaysOnErrorSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      // Privacy
      sendDefaultPii: false,
      // Ignore certain errors
      ignoreErrors: [
        "ResizeObserver loop limit exceeded",
        "ResizeObserver loop completed",
        "Non-Error promise rejection captured",
        "Network request failed",
        "Failed to fetch",
        "Load failed",
      ],
      // Before send - filter/sanitize
      beforeSend(event) {
        // Don't send in development
        if (import.meta.env.DEV) return null;
        // Remove sensitive data from breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((b) => {
            if (b.data && typeof b.data === "object") {
              const sanitized = { ...b.data };
              // Remove potentially sensitive fields
              delete sanitized.token;
              delete sanitized.password;
              delete sanitized.email;
              delete sanitized.authorization;
              return { ...b, data: sanitized };
            }
            return b;
          });
        }
        return event;
      },
    });

    // Integrate with React Router for breadcrumbs
    // Note: Requires router integration if needed
  });

  sentryInitialized = true;
}

// Helper to capture exceptions manually
export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (!sentryInitialized) return;
  import("@sentry/react").then((Sentry) => {
    Sentry.captureException(error, { extra: context });
  });
}

// Helper to capture messages
export function captureMessage(message: string, level: "info" | "warning" | "error" = "info") {
  if (!sentryInitialized) return;
  import("@sentry/react").then((Sentry) => {
    Sentry.captureMessage(message, level);
  });
}

// Set user context
export function setSentryUser(user: { id: string; email?: string; username?: string } | null) {
  if (!sentryInitialized) return;
  import("@sentry/react").then((Sentry) => {
    if (user) {
      Sentry.setUser({ id: user.id, email: user.email, username: user.username });
    } else {
      Sentry.setUser(null);
    }
  });
}

// Add breadcrumb
export function addSentryBreadcrumb(category: string, message: string, data?: Record<string, unknown>) {
  if (!sentryInitialized) return;
  import("@sentry/react").then((Sentry) => {
    Sentry.addBreadcrumb({
      category,
      message,
      data,
      level: "info",
    });
  });
}