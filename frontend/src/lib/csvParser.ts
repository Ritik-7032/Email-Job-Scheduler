const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ParseResult {
  validEmails: string[];
  ignoredCount: number;
  duplicateCount: number;
  totalParsed: number;
}

export function parseEmailList(rawText: string): ParseResult {
  if (!rawText || !rawText.trim()) {
    return {
      validEmails: [],
      ignoredCount: 0,
      duplicateCount: 0,
      totalParsed: 0,
    };
  }

  // Split on commas, semicolons, newlines, or tabs/spaces
  const tokens = rawText
    .split(/[\r\n,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const seen = new Set<string>();
  const validEmails: string[] = [];
  let ignoredCount = 0;
  let duplicateCount = 0;

  for (const token of tokens) {
    // If token has quotes or brackets, strip them
    const cleaned = token.replace(/^[<"']+|[>"']+$/g, '').trim();

    if (!cleaned) continue;

    if (EMAIL_REGEX.test(cleaned)) {
      const lower = cleaned.toLowerCase();
      if (seen.has(lower)) {
        duplicateCount++;
      } else {
        seen.add(lower);
        validEmails.push(cleaned);
      }
    } else {
      ignoredCount++;
    }
  }

  return {
    validEmails,
    ignoredCount,
    duplicateCount,
    totalParsed: tokens.length,
  };
}
