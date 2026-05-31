
// note : here we use branded types to create nominal types for various IDs in our domain. This allows us to have type safety and prevent mixing up different kinds of IDs, even though they are all represented as strings at runtime.
// example : if we have a function that takes a UserId, we can be sure that we won't accidentally pass a CourseId or a RefreshTokenId to it, because they are different types at compile time, even though they are all strings at runtime.

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Uuid<B extends string> = Brand<string, B>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidUuidError extends Error {
  constructor(value: string) {
    super(`invalid UUID: ${JSON.stringify(value)}`);
    this.name = 'InvalidUuidError';
  }
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function uuidFactory<B extends string>(): (value: string) => Uuid<B> {
  return (value: string): Uuid<B> => {
    if (!UUID_RE.test(value)) {
      throw new InvalidUuidError(value);
    }
    return value as Uuid<B>;
  };
}

export type UserId = Uuid<'UserId'>;
export type RefreshTokenId = Uuid<'RefreshTokenId'>;
export type StudentId = Uuid<'StudentId'>;
export type FaceEmbeddingId = Uuid<'FaceEmbeddingId'>;
export type CourseId = Uuid<'CourseId'>;
export type CourseEnrollmentId = Uuid<'CourseEnrollmentId'>;
export type AttendanceSessionId = Uuid<'AttendanceSessionId'>;
export type AttendanceRecordId = Uuid<'AttendanceRecordId'>;

// Validating constructors. `type X` and `const X` occupy separate namespaces,
// so each name doubles as both the type and its parse function.
export const UserId = uuidFactory<'UserId'>();
export const RefreshTokenId = uuidFactory<'RefreshTokenId'>();
export const StudentId = uuidFactory<'StudentId'>();
export const FaceEmbeddingId = uuidFactory<'FaceEmbeddingId'>();
export const CourseId = uuidFactory<'CourseId'>();
export const CourseEnrollmentId = uuidFactory<'CourseEnrollmentId'>();
export const AttendanceSessionId = uuidFactory<'AttendanceSessionId'>();
export const AttendanceRecordId = uuidFactory<'AttendanceRecordId'>();
