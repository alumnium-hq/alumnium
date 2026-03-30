const objectIds = new WeakMap<object, number>();
let nextId = 1;

export function pythonicId(obj: object): number {
  const existingId = objectIds.get(obj);
  if (existingId !== undefined) return existingId;

  const newId = nextId++;
  objectIds.set(obj, newId);
  return newId;
}
