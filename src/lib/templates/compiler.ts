export const ALLOWED_MERGE_VARIABLES = [
  'first_name',
  'last_name',
  'company',
  'title',
  'industry',
  'phone',
  'website',
  'email',
] as const;

export interface LeadMergeContext {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  industry?: string | null;
  phone?: string | null;
  website?: string | null;
  email: string;
  custom_fields?: Record<string, any>;
}

export interface TemplateCompileResult {
  renderedText: string;
  renderedHtml: string;
  usedVariables: string[];
  missingVariables: string[];
}

/**
 * Sanitizes HTML content by stripping scripts, iframes, and dangerous attributes.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return '';

  return html
    // Strip script tags and content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Strip iframe tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    // Strip javascript: pseudo-protocols in href/src
    .replace(/(href|src)=["']javascript:[^"']*["']/gi, '$1="#"')
    // Strip on* event handlers (e.g. onload, onerror, onclick)
    .replace(/\son\w+=["'][^"']*["']/gi, '')
    .replace(/\son\w+=[^\s>]+/gi, '');
}

/**
 * Extracts all merge variable tokens from a template string.
 * Matches `{{var}}` and `{{var | fallback}}`.
 */
export function extractMergeVariables(template: string): string[] {
  const matches = template.match(/\{\{\s*([a-zA-Z0-9_.]+)(?:\s*\|\s*[^}]+)?\s*\}\}/g);
  if (!matches) return [];

  const vars = new Set<string>();
  for (const m of matches) {
    const varNameMatch = m.match(/\{\{\s*([a-zA-Z0-9_.]+)/);
    if (varNameMatch && varNameMatch[1]) {
      vars.add(varNameMatch[1].trim());
    }
  }
  return Array.from(vars);
}

/**
 * Compiles a template by substituting merge variables with lead data and safe defaults.
 */
export function renderTemplate(
  subjectTemplate: string,
  bodyHtmlTemplate: string,
  lead: LeadMergeContext
): {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  usedVariables: string[];
  missingVariables: string[];
} {
  const usedVars: Set<string> = new Set();
  const missingVars: Set<string> = new Set();

  const replaceToken = (rawToken: string, varPath: string, fallback?: string): string => {
    usedVars.add(varPath);
    let resolvedValue: any = null;

    if (varPath.startsWith('custom.')) {
      const customKey = varPath.replace('custom.', '');
      resolvedValue = lead.custom_fields ? lead.custom_fields[customKey] : null;
    } else {
      resolvedValue = (lead as any)[varPath];
    }

    if (resolvedValue !== null && resolvedValue !== undefined && String(resolvedValue).trim().length > 0) {
      return String(resolvedValue).trim();
    }

    if (fallback !== undefined && fallback.trim().length > 0) {
      return fallback.trim();
    }

    missingVars.add(varPath);
    return ''; // Safe empty string replacement
  };

  const regex = /\{\{\s*([a-zA-Z0-9_.]+)(?:\s*\|\s*([^}]+))?\s*\}\}/g;

  const subject = subjectTemplate.replace(regex, (match, varPath, fallback) =>
    replaceToken(match, varPath, fallback)
  );

  const rawRenderedHtml = bodyHtmlTemplate.replace(regex, (match, varPath, fallback) =>
    replaceToken(match, varPath, fallback)
  );

  const sanitizedHtml = sanitizeEmailHtml(rawRenderedHtml);

  // Convert HTML to simple plain text
  const bodyText = sanitizedHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .trim();

  return {
    subject: subject.trim(),
    bodyHtml: sanitizedHtml,
    bodyText,
    usedVariables: Array.from(usedVars),
    missingVariables: Array.from(missingVars),
  };
}
