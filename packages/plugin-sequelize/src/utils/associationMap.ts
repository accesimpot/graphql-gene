const ASSOCIATION_FIELD_MAP: { [type: string]: Set<string> } = {}

export function markFieldAsAssociation(type: string, field: string) {
  ASSOCIATION_FIELD_MAP[type] = ASSOCIATION_FIELD_MAP[type] || new Set([])
  ASSOCIATION_FIELD_MAP[type].add(field)
}

export function isMarkedAsAssociation(type: string, field: string): boolean {
  return type in ASSOCIATION_FIELD_MAP && ASSOCIATION_FIELD_MAP[type].has(field)
}
