import fsp from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import type { User, UserRole } from '../../../shared/domain';
import { env } from '../config/env';
import { newId, nowIso } from '../core/id';
import { ConflictError, NotFoundError } from '../core/errors';

const FILE = 'users.json';

/**
 * Staff accounts live only in a file on the server - never in Google Sheets -
 * so password hashes are never shared with anyone.
 */
class UserStore {
  private users: User[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private readonly file: string;

  constructor(dir: string = env.dataDir) {
    this.file = path.join(dir, FILE);
  }

  async init(): Promise<void> {
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    try {
      this.users = JSON.parse(await fsp.readFile(this.file, 'utf8')) as User[];
    } catch {
      this.users = [];
    }
    if (this.users.length === 0) await this.createOwnerIfEmpty();
  }

  private async createOwnerIfEmpty(): Promise<void> {
    const now = nowIso();
    this.users = [
      {
        id: newId('USR'),
        name: env.owner.name,
        username: env.owner.username.toLowerCase(),
        passwordHash: await bcrypt.hash(env.owner.password, 10),
        role: 'OWNER',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
    await this.persist();
  }

  private async persist(): Promise<void> {
    const temp = `${this.file}.${process.pid}.tmp`;
    await fsp.writeFile(temp, JSON.stringify(this.users, null, 2), 'utf8');
    await fsp.rename(temp, this.file);
  }

  list(): User[] {
    return this.users;
  }

  findByUsername(username: string): User | undefined {
    const key = username.trim().toLowerCase();
    return this.users.find((user) => user.username.toLowerCase() === key);
  }

  findById(id: string): User | undefined {
    return this.users.find((user) => user.id === id);
  }

  async create(input: {
    name: string;
    username: string;
    password: string;
    role: UserRole;
  }): Promise<User> {
    return this.serialise(async () => {
      const key = input.username.trim().toLowerCase();
      if (this.findByUsername(key)) {
        throw new ConflictError('This username is already used. Try another one.');
      }
      const now = nowIso();
      const user: User = {
        id: newId('USR'),
        name: input.name.trim(),
        username: key,
        passwordHash: await bcrypt.hash(input.password, 10),
        role: input.role,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      this.users.push(user);
      await this.persist();
      return user;
    });
  }

  async update(
    id: string,
    patch: Partial<Pick<User, 'name' | 'role' | 'active'>> & { password?: string },
  ): Promise<User> {
    return this.serialise(async () => {
      const user = this.findById(id);
      if (!user) throw new NotFoundError('User not found.');
      if (patch.name !== undefined) user.name = patch.name.trim();
      if (patch.role !== undefined) user.role = patch.role;
      if (patch.active !== undefined) user.active = patch.active;
      if (patch.password) user.passwordHash = await bcrypt.hash(patch.password, 10);
      user.updatedAt = nowIso();
      await this.persist();
      return user;
    });
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  private async serialise<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => fn();
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

export const userStore = new UserStore();
export const initUsers = (): Promise<void> => userStore.init();
