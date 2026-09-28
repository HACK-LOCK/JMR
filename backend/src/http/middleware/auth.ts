import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthUser, UserRole } from '../../../../shared/domain';
import { env } from '../../config/env';
import { AuthError } from '../../core/errors';
import { userStore } from '../../data/userStore';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface TokenPayload {
  sub: string;
  name: string;
  username: string;
  role: UserRole;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, name: user.name, username: user.username, role: user.role },
    env.jwtSecret,
    { expiresIn: '30d' },
  );
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    next(new AuthError('Please log in.'));
    return;
  }
  try {
    const payload = jwt.verify(token, env.jwtSecret) as TokenPayload;
    const user = userStore.findById(payload.sub);
    if (!user || !user.active) {
      next(new AuthError('Please log in again.'));
      return;
    }
    req.user = { id: user.id, name: user.name, username: user.username, role: user.role };
    next();
  } catch {
    next(new AuthError('Your session has expired. Please log in again.'));
  }
}

export function requireOwner(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'OWNER') {
    next(new AuthError('Not available for this account.'));
    return;
  }
  next();
}

export function actorName(req: Request): string {
  return req.user?.name ?? 'Unknown';
}
