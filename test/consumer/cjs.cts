// A CommonJS consumer: TypeScript resolves the package's `require` condition and reads
// index.d.cts.

import { APIPromise, Doctronic, UsersResource, type User } from '@doctronic-ai/sdk';

export function createUser(client: Doctronic): APIPromise<User> {
  const users: UsersResource = client.users;
  return users.create({ firstName: 'Avery' });
}

export const isUsers = (value: unknown): value is UsersResource => value instanceof UsersResource;
