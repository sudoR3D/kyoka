export class KyokaError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
  }
}

export class SubjectNotFoundError extends KyokaError {
  constructor(message = "Kyoka: subject not found") {
    super("subject_not_found", message, 404);
  }
}

export class AliasConflictError extends KyokaError {
  constructor(message = "Kyoka: alias belongs to another subject") {
    super("alias_conflict", message, 409);
  }
}

export class InvalidInputError extends KyokaError {
  constructor(message: string) {
    super("invalid_input", message, 400);
  }
}

export class PlansNotConfiguredError extends KyokaError {
  constructor(message = "Kyoka: plans are not configured") {
    super("plans_not_configured", message, 503);
  }
}
