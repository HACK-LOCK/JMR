import { Router } from 'express';
import type { AuthUser } from '../../../../shared/domain';
import { env } from '../../config/env';
import { userStore } from '../../data/userStore';
import { safeEqual } from '../../core/id';
import { AuthError, NotFoundError } from '../../core/errors';
import { requireAuth, signToken } from '../middleware/auth';
import { asyncRoute, sendData } from '../middleware/respond';
import {
  loginSchema,
  passwordChangeSchema,
  stockUnlockSchema,
  userCreateSchema,
} from '../../validation/schemas';

export const authRouter = Router();

/**
 * Small in-memory guard so the Stock PIN cannot be guessed by tapping through
 * it. It resets when the server restarts, which is enough for a shop counter.
 */
const pinFailures = new Map<string, { count: number; lockedUntil: number }>();

function assertPinNotLocked(userId: string): void {
  const entry = pinFailures.get(userId);
  if (!entry) return;
  if (entry.lockedUntil > Date.now()) {
    const seconds = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    throw new AuthError(`Too many wrong tries. Please wait ${seconds} seconds.`);
  }
  pinFailures.delete(userId);
}

function recordPinFailure(userId: string): void {
  const entry = pinFailures.get(userId) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= env.stockPinMaxAttempts) {
    entry.lockedUntil = Date.now() + 60_000;
    entry.count = 0;
  }
  pinFailures.set(userId, entry);
}

function clearPinFailures(userId: string): void {
  pinFailures.delete(userId);
}

/**
 * Checks the shop's own PIN, shared with the Stock lock, and keeps the tap
 * through guard on it. Throws when the PIN is wrong, so a caller cannot forget
 * to count the failure.
 */
async function verifyShopPin(userId: string, pin: string): Promise<void> {
  assertPinNotLocked(userId);

  // A shared shop PIN when the owner set one, otherwise the person's own
  // account password. Either way the check happens here, on the server, and
  // the answer sent back is the same for a wrong PIN and a wrong account.
  const sharedPin = env.stockPin;
  let ok = false;
  if (sharedPin) {
    ok = safeEqual(pin, sharedPin);
  } else {
    const user = await userStore.findById(userId);
    ok = Boolean(user && (await userStore.verifyPassword(user, pin)));
  }

  if (!ok) {
    recordPinFailure(userId);
    throw new AuthError('Wrong PIN.');
  }
  clearPinFailures(userId);
}

authRouter.post(
  '/login',
  asyncRoute(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const user = await userStore.findByUsername(username);
    // Identical message whether the user is unknown or the password is wrong.
    if (!user || !(await userStore.verifyPassword(user, password))) {
      throw new AuthError('Wrong username or password.');
    }
    if (!user.active) throw new AuthError('This account is turned off. Ask the person who set up the app.');

    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
    };
    sendData(res, { token: signToken(authUser), user: authUser });
  }),
);

authRouter.post(
  '/stock/unlock',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { pin } = stockUnlockSchema.parse(req.body);
    const id = req.user?.id;
    if (!id) throw new AuthError('Please log in again.');
    await verifyShopPin(id, pin);
    sendData(res, { unlocked: true, expiresInMinutes: env.stockPinTtlMinutes });
  }),
);

/**
 * The same shop PIN, checked without unlocking anything. Used by the billing
 * dashboard to bring hidden figures back, so asking for the PIN there must not
 * also open the Stock area.
 */
authRouter.post(
  '/pin/verify',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { pin } = stockUnlockSchema.parse(req.body);
    const id = req.user?.id;
    if (!id) throw new AuthError('Please log in again.');
    await verifyShopPin(id, pin);
    sendData(res, { verified: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    sendData(res, req.user);
  }),
);

authRouter.get(
  '/users',
  requireAuth,
  asyncRoute(async (_req, res) => {
    const users = (await userStore.list()).map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      active: user.active,
    }));
    sendData(res, users);
  }),
);

authRouter.post(
  '/users',
  requireAuth,
  asyncRoute(async (req, res) => {
    if (req.user?.role !== 'OWNER') throw new AuthError('Not available for this account.');
    const input = userCreateSchema.parse(req.body);
    const user = await userStore.create(input);
    sendData(res, {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      active: user.active,
    });
  }),
);

/**
 * Change your OWN password. Without this the seeded default password could
 * never be replaced from the app, and every account would keep it forever.
 */
authRouter.patch(
  '/password',
  requireAuth,
  asyncRoute(async (req, res) => {
    const id = req.user?.id;
    if (!id) throw new AuthError('Please log in again.');
    const { currentPassword, newPassword } = passwordChangeSchema.parse(req.body);

    const user = await userStore.findById(id);
    if (!user) throw new NotFoundError('Account not found.');
    if (!(await userStore.verifyPassword(user, currentPassword))) {
      throw new AuthError('Your current password is not correct.');
    }

    await userStore.update(id, { password: newPassword });
    sendData(res, { changed: true });
  }),
);
