/**
 * Application level errors.
 *
 * Everything the employee sees is a short, plain-English sentence. Technical
 * detail goes to the server log only - stack traces are never returned.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];

  constructor(message: string, status = 400, code = 'BAD_REQUEST', details: string[] = []) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: string[] = []) {
    super(message, 422, 'VALIDATION', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details: string[] = []) {
    super(message, 409, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

export class AuthError extends AppError {
  constructor(message = 'Please log in again.') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'AuthError';
  }
}

export class SyncError extends AppError {
  constructor(message = 'Unable to sync right now. Please try again.', details: string[] = []) {
    super(message, 503, 'SYNC_UNAVAILABLE', details);
    this.name = 'SyncError';
  }
}
