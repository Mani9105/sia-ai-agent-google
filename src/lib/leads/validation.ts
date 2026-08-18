export interface RawLeadInput {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  industry?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  website?: string | null;
  custom_fields?: Record<string, any>;
}

export interface ValidatedLead {
  email: string;
  normalized_email: string;
  email_domain: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  industry?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  website?: string | null;
  custom_fields: Record<string, any>;
}

// RFC 5322 compliant simplified email validator
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates and normalizes lead data before database entry.
 */
export function validateAndNormalizeLead(raw: RawLeadInput): { valid: boolean; lead?: ValidatedLead; error?: string } {
  if (!raw.email || typeof raw.email !== 'string') {
    return { valid: false, error: 'Email address is required.' };
  }

  const normalized_email = raw.email.toLowerCase().trim();

  if (normalized_email.length > 320) {
    return { valid: false, error: 'Email address exceeds maximum length (320 chars).' };
  }

  if (!EMAIL_REGEX.test(normalized_email)) {
    return { valid: false, error: `Invalid email format: '${normalized_email}'` };
  }

  const domainParts = normalized_email.split('@');
  if (domainParts.length !== 2 || !domainParts[1].includes('.')) {
    return { valid: false, error: `Invalid email domain: '${normalized_email}'` };
  }

  const email_domain = domainParts[1].toLowerCase().trim();

  return {
    valid: true,
    lead: {
      email: raw.email.trim(),
      normalized_email,
      email_domain,
      first_name: raw.first_name?.trim() || null,
      last_name: raw.last_name?.trim() || null,
      company: raw.company?.trim() || null,
      title: raw.title?.trim() || null,
      industry: raw.industry?.trim() || null,
      phone: raw.phone?.trim() || null,
      linkedin_url: raw.linkedin_url?.trim() || null,
      website: raw.website?.trim() || null,
      custom_fields: raw.custom_fields || {},
    },
  };
}
