export function merchantKey(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
