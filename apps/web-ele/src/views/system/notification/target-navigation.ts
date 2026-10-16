import type { RouteLocationResolved, Router } from 'vue-router';

export type NotificationTargetAvailability =
  | 'available'
  | 'forbidden'
  | 'missing'
  | 'unavailable';

export type NotificationRecordTargetValidator = (
  route: RouteLocationResolved,
  roles: readonly string[],
) => NotificationTargetAvailability | Promise<NotificationTargetAvailability>;

export type NotificationTargetResolution =
  | {
      fullPath: string;
      kind: 'internal';
      name: null | string | symbol | undefined;
      policy: 'list' | 'record';
    }
  | { kind: 'empty' | 'external' | 'invalid' | 'missing' | 'unavailable' }
  | { kind: 'forbidden' };

const CONTROL_CHARACTERS = {
  test: (value: string) =>
    [...value].some(
      (character) =>
        (character.codePointAt(0) ?? 128) < 32 ||
        (character.codePointAt(0) ?? 128) === 127,
    ),
};
const ENCODED_BACKSLASH = /%5c/i;

// Only these route roots are approved for direct list navigation. Record routes
// must register a business-owned validator before they can be used as targets.
const LIST_TARGET_PATHS = new Set([
  '/ai/model',
  '/infra/file',
  '/infra/notice',
  '/monitor/job',
  '/monitor/jobLog',
  '/notifications',
  '/system/dict',
  '/system/notification-template',
  '/system/user',
]);

const recordTargetValidators = new Map<
  string | symbol,
  NotificationRecordTargetValidator
>();

/**
 * Register an explicit record check for a named business route.
 * The business-owned check must verify record availability and the current
 * user's access through that feature's own API. Throwing fails closed.
 */
export function registerNotificationRecordTargetValidator(
  routeName: string | symbol,
  validator: NotificationRecordTargetValidator,
) {
  recordTargetValidators.set(routeName, validator);
  return () => {
    if (recordTargetValidators.get(routeName) === validator) {
      recordTargetValidators.delete(routeName);
    }
  };
}

export function resolveNotificationTarget(
  target: null | string,
  router: Router,
  roles: string[],
): NotificationTargetResolution {
  if (!target?.trim()) return { kind: 'empty' };

  const value = target.trim();
  if (/^https:\/\//i.test(value)) return { kind: 'external' };
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    CONTROL_CHARACTERS.test(value) ||
    ENCODED_BACKSLASH.test(value)
  ) {
    return { kind: 'invalid' };
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return { kind: 'invalid' };
  }
  if (decoded.includes('\\') || hasTraversalSegment(decoded)) {
    return { kind: 'invalid' };
  }

  const resolved = router.resolve(value);
  if (
    resolved.matched.length === 0 ||
    resolved.matched.some((record) => record.name === 'FallbackNotFound')
  ) {
    return { kind: 'missing' };
  }

  if (isForbidden(resolved, roles)) return { kind: 'forbidden' };

  if (isApprovedListRoute(resolved)) {
    return {
      kind: 'internal',
      fullPath: resolved.fullPath,
      name: resolved.name,
      policy: 'list',
    };
  }

  if (
    resolved.name !== null &&
    resolved.name !== undefined &&
    recordTargetValidators.has(resolved.name)
  ) {
    return {
      kind: 'internal',
      fullPath: resolved.fullPath,
      name: resolved.name,
      policy: 'record',
    };
  }

  return { kind: 'unavailable' };
}

export async function validateNotificationTarget(
  target: Extract<NotificationTargetResolution, { kind: 'internal' }>,
  router: Router,
  roles: string[],
): Promise<NotificationTargetAvailability> {
  const resolved = router.resolve(target.fullPath);
  if (
    resolved.matched.length === 0 ||
    resolved.matched.some((record) => record.name === 'FallbackNotFound') ||
    resolved.name !== target.name
  ) {
    return 'missing';
  }
  if (isForbidden(resolved, roles)) return 'forbidden';

  if (target.policy === 'list') {
    return isApprovedListRoute(resolved) ? 'available' : 'unavailable';
  }

  if (resolved.name === null || resolved.name === undefined)
    return 'unavailable';
  const validator = recordTargetValidators.get(resolved.name);
  if (!validator) return 'unavailable';

  try {
    const availability: unknown = await validator(resolved, roles);
    return isNotificationTargetAvailability(availability)
      ? availability
      : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

function isNotificationTargetAvailability(
  value: unknown,
): value is NotificationTargetAvailability {
  return (
    value === 'available' ||
    value === 'forbidden' ||
    value === 'missing' ||
    value === 'unavailable'
  );
}

function isApprovedListRoute(route: RouteLocationResolved) {
  return (
    LIST_TARGET_PATHS.has(route.path) &&
    Object.keys(route.params).length === 0 &&
    Object.keys(route.query).length === 0 &&
    !route.hash
  );
}

function isForbidden(route: RouteLocationResolved, roles: string[]) {
  return route.matched.some((record) => {
    const authority = record.meta.authority ?? record.meta.roles;
    return (
      Array.isArray(authority) &&
      authority.length > 0 &&
      !authority.some((role) => roles.includes(role))
    );
  });
}

function hasTraversalSegment(value: string) {
  const path = value.split(/[?#]/, 1)[0] ?? '';
  return path.split('/').some((segment) => segment === '.' || segment === '..');
}
