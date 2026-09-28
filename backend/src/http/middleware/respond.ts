import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../core/errors';

/** Wraps an async handler so rejected promises reach the error middleware. */
export function asyncRoute<T extends Request = Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req as T, res, next).catch(next);
  };
}

/** Route params are always present; this keeps the handlers free of `!`. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value === '') {
    throw new AppError('This screen does not exist.', 404, 'NOT_FOUND');
  }
  return value;
}

/** Standard success envelope. A warning never blocks the data. */
export function sendData(res: Response, data: unknown, warning?: { code: string; message: string }): void {
  if (warning) res.json({ data, warning });
  else res.json({ data });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'This screen does not exist.' } });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => issue.message);
    res.status(422).json({
      error: {
        code: 'VALIDATION',
        message: details[0] ?? 'Please check the details and try again.',
        details,
      },
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  // Never leak a stack trace to the employee screen - log it for the owner.
  console.error('[api] unhandled error:', error);
  res.status(500).json({
    error: {
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
      details: [],
      ...(process.env.NODE_ENV !== 'production' ? { debug: message } : {}),
    },
  });
}
