
export const Role = {
  PROFESSOR: 'PROFESSOR',
  ADMIN: 'ADMIN',
  STUDENT: 'STUDENT',
} as const; // becuase of const now Role is a readonly object with literal string values, so we can derive the Role type from it and be sure that it always stays in sync.

export type Role = (typeof Role)[keyof typeof Role];

export const ROLES: readonly Role[] = Object.values(Role);

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * Coarse-grained capabilities. Routes are guarded by capability rather than by
 * role directly, so the role→capability mapping can evolve without touching
 * every handler.
 */
export const Capability = {
  MANAGE_USERS: 'manage:users',
  MANAGE_COURSES: 'manage:courses',
  MANAGE_OWN_COURSES: 'manage:own-courses',
  ENROLL_STUDENTS: 'enroll:students',
  RUN_ATTENDANCE: 'run:attendance',
  VIEW_OWN_ATTENDANCE: 'view:own-attendance',
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

const ROLE_CAPABILITIES: Readonly<Record<Role, readonly Capability[]>> = {
  ADMIN: [
    Capability.MANAGE_USERS,
    Capability.MANAGE_COURSES,
    Capability.MANAGE_OWN_COURSES,
    Capability.ENROLL_STUDENTS,
    Capability.RUN_ATTENDANCE,
    Capability.VIEW_OWN_ATTENDANCE,
  ],
  PROFESSOR: [
    Capability.MANAGE_OWN_COURSES,
    Capability.ENROLL_STUDENTS,
    Capability.RUN_ATTENDANCE,
  ],
  STUDENT: [Capability.VIEW_OWN_ATTENDANCE],
};

/** Whether `role` is granted `capability`. */
export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

/** All capabilities granted to `role` (defensive copy). */
export function capabilitiesOf(role: Role): readonly Capability[] {
  return [...ROLE_CAPABILITIES[role]];
}
