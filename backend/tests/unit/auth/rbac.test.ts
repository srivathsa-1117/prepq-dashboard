import { describe, it, expect } from 'vitest';
import { roleAtLeast, highestRoleFor, assertRole } from '../../../src/auth/rbac.js';
import { ForbiddenError } from '../../../src/utils/errors.js';
import type { AuthContext } from '../../../src/types/domain.js';

describe('rbac', () => {
  describe('roleAtLeast', () => {
    it('ranks roles from viewer (lowest) to owner (highest)', () => {
      expect(roleAtLeast('owner', 'viewer')).toBe(true);
      expect(roleAtLeast('viewer', 'owner')).toBe(false);
      expect(roleAtLeast('manager', 'manager')).toBe(true);
      expect(roleAtLeast('analyst', 'manager')).toBe(false);
    });
  });

  describe('assertRole', () => {
    it('throws ForbiddenError when the role is below the minimum', () => {
      expect(() => assertRole('viewer', 'admin')).toThrow(ForbiddenError);
    });

    it('does not throw when the role meets the minimum', () => {
      expect(() => assertRole('admin', 'admin')).not.toThrow();
      expect(() => assertRole('owner', 'manager')).not.toThrow();
    });
  });

  describe('highestRoleFor', () => {
    it('returns null when the user has no membership in the organization', () => {
      const auth: AuthContext = { userId: 'u1', email: null, memberships: [{ organizationId: 'org-2', role: 'owner' }] };
      expect(highestRoleFor(auth, 'org-1')).toBeNull();
    });

    it('returns the single membership role when only one exists', () => {
      const auth: AuthContext = { userId: 'u1', email: null, memberships: [{ organizationId: 'org-1', role: 'analyst' }] };
      expect(highestRoleFor(auth, 'org-1')).toBe('analyst');
    });

    it('returns the highest of multiple memberships in the same organization (defensive - schema enforces uniqueness)', () => {
      const auth: AuthContext = {
        userId: 'u1',
        email: null,
        memberships: [
          { organizationId: 'org-1', role: 'viewer' },
          { organizationId: 'org-1', role: 'admin' },
        ],
      };
      expect(highestRoleFor(auth, 'org-1')).toBe('admin');
    });
  });
});
