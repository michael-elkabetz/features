/**
 * Derives a kebab-case feature name from a topic string.
 * "add a new text command" -> "text-command"
 * "adding a new 3rd party integration" -> "vendor-integration"
 * "error handling patterns" -> "error-handling"
 */
export function deriveFeatureName(topic: string): string {
  const stopWords = new Set([
    'a', 'an', 'the', 'new', 'add', 'adding', 'create', 'creating',
    'implement', 'implementing', 'build', 'building', 'make', 'making',
    'how', 'to', 'for', 'in', 'of', 'and', 'or', 'with', 'about',
    'patterns', 'pattern', 'conventions', 'convention',
  ]);

  const words = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0 && !stopWords.has(w));

  const picked = words.slice(0, 2);

  if (picked.length === 0) {
    return 'feature';
  }

  return picked.join('-');
}
