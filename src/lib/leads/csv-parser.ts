import { RawLeadInput } from './validation';

export interface CsvParseResult {
  leads: RawLeadInput[];
  totalRows: number;
  invalidRows: number;
  errors: string[];
}

export const CSV_MAX_ROWS = 5000;
export const CSV_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// Fuzzy header matchers
const HEADER_MAPPINGS: Record<keyof Omit<RawLeadInput, 'custom_fields'>, string[]> = {
  email: ['email', 'email address', 'e-mail', 'work email', 'contact email'],
  first_name: ['first name', 'firstname', 'first', 'fname', 'given name'],
  last_name: ['last name', 'lastname', 'last', 'lname', 'surname', 'family name'],
  company: ['company', 'company name', 'organization', 'org', 'account', 'business name'],
  title: ['title', 'job title', 'position', 'role', 'designation'],
  industry: ['industry', 'sector', 'vertical'],
  phone: ['phone', 'phone number', 'mobile', 'telephone', 'tel', 'cell'],
  linkedin_url: ['linkedin', 'linkedin url', 'linkedin profile', 'linkedin_url'],
  website: ['website', 'company website', 'url', 'domain', 'web'],
};

/**
 * Parses raw CSV text into mapped lead objects with strict size and row caps.
 */
export function parseCsvLeads(csvText: string): CsvParseResult {
  const result: CsvParseResult = {
    leads: [],
    totalRows: 0,
    invalidRows: 0,
    errors: [],
  };

  if (!csvText || csvText.trim().length === 0) {
    result.errors.push('CSV content is empty.');
    return result;
  }

  // Split lines accounting for \r\n and \n
  const rawLines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (rawLines.length < 2) {
    result.errors.push('CSV must contain a header row and at least one data row.');
    return result;
  }

  if (rawLines.length - 1 > CSV_MAX_ROWS) {
    result.errors.push(`CSV exceeds maximum allowable limit of ${CSV_MAX_ROWS} rows. Please split your file.`);
    return result;
  }

  // Simple CSV line tokenizer respecting quotes
  const tokenizeLine = (line: string): string[] => {
    const tokens: string[] = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip escaped quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        tokens.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    tokens.push(current.trim());
    return tokens;
  };

  const headers = tokenizeLine(rawLines[0]).map((h) => h.toLowerCase().trim());
  const columnMap: Record<number, keyof Omit<RawLeadInput, 'custom_fields'> | string> = {};

  // Build header mapping index
  headers.forEach((header, index) => {
    let matched = false;
    for (const [key, aliases] of Object.entries(HEADER_MAPPINGS)) {
      if (aliases.includes(header)) {
        columnMap[index] = key as keyof Omit<RawLeadInput, 'custom_fields'>;
        matched = true;
        break;
      }
    }
    if (!matched) {
      columnMap[index] = `custom_${header.replace(/[^a-z0-9_]/gi, '_')}`;
    }
  });

  // Verify email column exists
  const hasEmailColumn = Object.values(columnMap).includes('email');
  if (!hasEmailColumn) {
    result.errors.push("Missing required 'email' column header.");
    return result;
  }

  // Parse data rows
  for (let i = 1; i < rawLines.length; i++) {
    const rowValues = tokenizeLine(rawLines[i]);
    const lead: RawLeadInput = { email: '', custom_fields: {} };

    rowValues.forEach((val, idx) => {
      const field = columnMap[idx];
      if (!field || !val) return;

      if (field.startsWith('custom_')) {
        const customKey = field.replace('custom_', '');
        lead.custom_fields![customKey] = val;
      } else {
        (lead as any)[field] = val;
      }
    });

    result.totalRows++;

    if (!lead.email || !lead.email.includes('@')) {
      result.invalidRows++;
    } else {
      result.leads.push(lead);
    }
  }

  return result;
}
