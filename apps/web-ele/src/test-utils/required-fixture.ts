export function requireTestFixture<T>(value: null | T | undefined): T {
  if (value === null || value === undefined) {
    throw new Error('Required test fixture is missing');
  }
  return value;
}
