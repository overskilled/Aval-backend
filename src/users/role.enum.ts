import { UserRole } from '@prisma/client';

export { UserRole };

export const SELF_REGISTERABLE_ROLES: UserRole[] = [
  'citizen',
  'manufacturer',
  'government',
];
