export class PlanLimitError extends Error {
  constructor(
    message: string,
    public readonly code: "STAFF_LIMIT" | "CREDENTIAL_LIMIT" | "USER_LIMIT",
    public readonly current: number,
    public readonly max: number,
  ) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export class RlsViolationError extends Error {
  constructor(message = "Access denied") {
    super(message);
    this.name = "RlsViolationError";
  }
}

export class WebhookValidationError extends Error {
  constructor(message = "Invalid webhook payload") {
    super(message);
    this.name = "WebhookValidationError";
  }
}
