// Input sanitization utilities

/** Strip HTML tags from a string */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

/** Sanitize a plain text input: trim, strip HTML, enforce max length */
export function sanitizeText(input: string, maxLength = 255): string {
  return stripHtml(input).trim().slice(0, maxLength);
}

/** Sanitize announcement content: allow basic text but strip dangerous tags/attributes */
export function sanitizeAnnouncementContent(input: string): string {
  // Strip script tags, event handlers, and dangerous elements
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>.*?<\/iframe>/gi, "")
    .replace(/<object\b[^>]*>.*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\bon\w+\s*=\s*[^\s>]*/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/data\s*:\s*text\/html/gi, "")
    .trim()
    .slice(0, 5000);
}

/** Validate that a string doesn't exceed max length */
export function validateLength(input: string | undefined | null, max: number): boolean {
  if (!input) return true;
  return input.length <= max;
}
