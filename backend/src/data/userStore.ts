import fsp from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import type { User, UserRole } from '../../../shared/domain';
import { env } from '../config/env';
import { newId, nowIso } from '../core/id';
import { ConflictError, NotFoundError } from '../core/errors';
import { isDatabaseConfigured, getPool } from './postgres/pool';
import { USER_SPEC, columnList, toRecord, toValues } from './postgres/rows';

const FILE = 'users.json';

/** What the login and user routes need from wherever accounts are kept. */
interface UserRepository {
  readonly where: string;
  init(): Promise<void>;
  list(): Promise<User[]>;
  findByUsername(username: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  create(input: { name: string; username: string; password: string; role: UserRole }): Promise<User>;
  update(
    id: string,
    patch: Partial<Pick<User, 'name' | 'role' | 'active'>> & { password?: string },
  ): Promise<User>;
}

/**
 * Accounts in a file on the server.
 *
 * Used when there is no database, i.e. on a developer's machine and in the
 * tests. It is never used in production: Render wipes its filesystem on every
 * deploy, so accounts kept this way would all vanish on the next release and
 * nobody would be able to log in.
 */
class FileUserRepository implements UserRepository {
  readonly where = 'a file on this computer';

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

  async list(): Promise<User[]> {
    return this.users;
  }

  async findByUsername(username: string): Promise<User | undefined> {
    const key = username.trim().toLowerCase();
    return this.users.find((user) => user.username.toLowerCase() === key);
  }

  async findById(id: string): Promise<User | undefined> {
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
      if (await this.findByUsername(key)) {
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
      const user = this.users.find((item) => item.id === id);
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

  private async serialise<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => fn();
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/**
 * Accounts in the shop's own database.
 *
 * Every read is a single query by id or username, so the server is not holding a
 * list of password hashes in memory, and an account made on one device is
 * usable on the next without waiting for a restart.
 *
 * The first owner account is created by `npm run db:setup`, not here. Creating
 * one at boot would mean a production database quietly grows a login with a
 * default password every time it starts.
 */
class DbUserRepository implements UserRepository {
  readonly where = 'the online database';

  async init(): Promise<void> {
    const count = await this.count();
    if (count > 0) return;
    console.warn(
      '[users] The database has no staff accounts yet, so nobody can log in.\n' +
        '        Run "npm run db:setup" against this database to create the first owner account.',
    );
  }

  private async count(): Promise<number> {
    const { rows } = await getPool().query('select count(*)::int as count from users');
    return Number((rows[0] as { count: number }).count);
  }

  private async findBy(where: string, value: string): Promise<User | undefined> {
    const { rows } = await getPool().query(
      `select ${columnList(USER_SPEC).join(', ')} from users where ${where} = $1 limit 1`,
      [value],
    );
    return rows[0] ? (toRecord(USER_SPEC, rows[0] as Record<string, unknown>) as unknown as User) : undefined;
  }

  async list(): Promise<User[]> {
    const { rows } = await getPool().query(
      `select ${columnList(USER_SPEC).join(', ')} from users order by created_at`,
    );
    return rows.map((row) => toRecord(USER_SPEC, row as Record<string, unknown>) as unknown as User);
  }

  async findByUsername(username: string): Promise<User | undefined> {
    return this.findBy('lower(username)', username.trim().toLowerCase());
  }

  async findById(id: string): Promise<User | undefined> {
    return this.findBy('id', id);
  }

  async create(input: {
    name: string;
    username: string;
    password: string;
    role: UserRole;
  }): Promise<User> {
    const key = input.username.trim().toLowerCase();
    if (await this.findByUsername(key)) {
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
    const columns = columnList(USER_SPEC);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    try {
      await getPool().query(
        `insert into users (${columns.join(', ')}) values ${placeholders}`,
        toValues(USER_SPEC, user as unknown as Record<string, unknown>),
      );
    } catch (error) {
      // The unique index is the real guard against two people taking one name.
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError('This username is already used. Try another one.');
      }
      throw error;
    }
    return user;
  }

  async update(
    id: string,
    patch: Partial<Pick<User, 'name' | 'role' | 'active'>> & { password?: string },
  ): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundError('User not found.');
    if (patch.name !== undefined) user.name = patch.name.trim();
    if (patch.role !== undefined) user.role = patch.role;
    if (patch.active !== undefined) user.active = patch.active;
    if (patch.password) user.passwordHash = await bcrypt.hash(patch.password, 10);
    user.updatedAt = nowIso();
    const all = toValues(USER_SPEC, user as unknown as Record<string, unknown>);
    // Update every column except the id, which is what identifies the row.
    const updates = USER_SPEC.columns
      .map((column, index) => ({ column, value: all[index] }))
      .filter((entry) => entry.column.col !== USER_SPEC.key);
    const assignments = updates.map((entry, index) => `${entry.column.col} = $${index + 2}`);
    await getPool().query(
      `update users set ${assignments.join(', ')} where id = $1`,
      [id, ...updates.map((entry) => entry.value)],
    );
    return user;
  }
}

/**
 * Staff accounts, in the database when there is one.
 *
 * Passwords are bcrypt hashes everywhere and are never sent to the browser, and
 * never written to Google Sheets. The public shape of this object is what the
 * auth routes use, so where the accounts physically live is the only thing that
 * changes between a shop running on Render and a developer running the tests.
 */
class UserStore {
  private repository: UserRepository | null = null;

  private get repo(): UserRepository {
    if (!this.repository) throw new Error('Staff accounts are not ready yet');
    return this.repository;
  }

  async init(): Promise<void> {
    this.repository = isDatabaseConfigured() ? new DbUserRepository() : new FileUserRepository();
    await this.repository.init();
  }

  where(): string {
    return this.repo.where;
  }

  list(): Promise<User[]> {
    return this.repo.list();
  }

  findByUsername(username: string): Promise<User | undefined> {
    return this.repo.findByUsername(username);
  }

  findById(id: string): Promise<User | undefined> {
    return this.repo.findById(id);
  }

  create(input: { name: string; username: string; password: string; role: UserRole }): Promise<User> {
    return this.repo.create(input);
  }

  update(
    id: string,
    patch: Partial<Pick<User, 'name' | 'role' | 'active'>> & { password?: string },
  ): Promise<User> {
    return this.repo.update(id, patch);
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    if (!user.passwordHash) return false;
    return bcrypt.compare(password, user.passwordHash);
  }
}

export const userStore = new UserStore();
export const initUsers = (): Promise<void> => userStore.init();
