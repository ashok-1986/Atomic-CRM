import { useMemo, useCallback, useState } from "react";
import type { ContactImportSchema } from "./useContactImport";

// All CRM contact fields that can be mapped
export const CRM_FIELDS: {
  key: keyof ContactImportSchema;
  label: string;
  required: boolean;
}[] = [
  { key: "first_name", label: "First Name", required: true },
  { key: "last_name", label: "Last Name", required: true },
  { key: "gender", label: "Gender", required: false },
  { key: "title", label: "Job Title", required: false },
  { key: "company", label: "Company", required: false },
  { key: "email_work", label: "Work Email", required: false },
  { key: "email_home", label: "Home Email", required: false },
  { key: "email_other", label: "Other Email", required: false },
  { key: "phone_work", label: "Work Phone", required: false },
  { key: "phone_home", label: "Home Phone", required: false },
  { key: "phone_other", label: "Other Phone", required: false },
  { key: "background", label: "Background", required: false },
  { key: "first_seen", label: "First Seen", required: false },
  { key: "last_seen", label: "Last Seen", required: false },
  { key: "has_newsletter", label: "Has Newsletter", required: false },
  { key: "status", label: "Status", required: false },
  { key: "tags", label: "Tags", required: false },
  { key: "linkedin_url", label: "LinkedIn URL", required: false },
];

// Synonyms for auto-matching CSV headers to CRM fields
const FIELD_SYNONYMS: Record<keyof ContactImportSchema, string[]> = {
  first_name: [
    "first name",
    "firstname",
    "first",
    "given name",
    "givenname",
    "name",
    "contact name",
    "fname",
  ],
  last_name: [
    "last name",
    "lastname",
    "last",
    "surname",
    "family name",
    "familyname",
    "lname",
  ],
  gender: ["gender", "sex"],
  title: [
    "title",
    "job title",
    "jobtitle",
    "position",
    "role",
    "designation",
    "job role",
  ],
  company: [
    "company",
    "company name",
    "companyname",
    "organization",
    "organisation",
    "org",
    "employer",
    "firm",
    "business",
  ],
  email_work: [
    "email work",
    "work email",
    "email",
    "e-mail",
    "email address",
    "emailaddress",
    "business email",
    "corporate email",
    "email1",
    "primary email",
  ],
  email_home: [
    "email home",
    "home email",
    "personal email",
    "email2",
    "secondary email",
    "private email",
  ],
  email_other: ["email other", "other email", "email3", "alternate email"],
  phone_work: [
    "phone work",
    "work phone",
    "phone",
    "telephone",
    "phone number",
    "phonenumber",
    "business phone",
    "office phone",
    "phone1",
    "mobile",
    "cell",
    "cell phone",
    "cellphone",
  ],
  phone_home: [
    "phone home",
    "home phone",
    "phone2",
    "personal phone",
    "residence phone",
  ],
  phone_other: ["phone other", "other phone", "phone3", "fax"],
  background: [
    "background",
    "bio",
    "biography",
    "notes",
    "description",
    "about",
    "summary",
    "comments",
  ],
  first_seen: [
    "first seen",
    "firstseen",
    "created",
    "created at",
    "createdat",
    "date added",
    "added on",
    "creation date",
  ],
  last_seen: [
    "last seen",
    "lastseen",
    "updated",
    "updated at",
    "updatedat",
    "last activity",
    "last contact",
    "last modified",
  ],
  has_newsletter: [
    "has newsletter",
    "newsletter",
    "subscribed",
    "email opt in",
    "mailing list",
  ],
  status: [
    "status",
    "lead status",
    "contact status",
    "stage",
    "lead stage",
    "temperature",
  ],
  tags: ["tags", "labels", "categories", "groups", "segments"],
  linkedin_url: [
    "linkedin url",
    "linkedinurl",
    "linkedin",
    "linkedin profile",
    "linkedin link",
  ],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function autoMatchHeaders(
  csvHeaders: string[]
): Record<string, keyof ContactImportSchema | ""> {
  const mapping: Record<string, keyof ContactImportSchema | ""> = {};
  const usedCrmFields = new Set<string>();

  // First pass: exact match on key name
  for (const header of csvHeaders) {
    const normalizedHeader = normalize(header);
    for (const field of CRM_FIELDS) {
      if (usedCrmFields.has(field.key)) continue;
      if (normalizedHeader === normalize(field.key)) {
        mapping[header] = field.key;
        usedCrmFields.add(field.key);
        break;
      }
    }
  }

  // Second pass: synonym matching for unmatched headers
  for (const header of csvHeaders) {
    if (mapping[header]) continue;
    const normalizedHeader = normalize(header);

    for (const [fieldKey, synonyms] of Object.entries(FIELD_SYNONYMS)) {
      if (usedCrmFields.has(fieldKey)) continue;
      const match = synonyms.some(
        (synonym) =>
          normalizedHeader === normalize(synonym) ||
          normalize(synonym).includes(normalizedHeader) ||
          normalizedHeader.includes(normalize(synonym))
      );
      if (match) {
        mapping[header] = fieldKey as keyof ContactImportSchema;
        usedCrmFields.add(fieldKey);
        break;
      }
    }

    // If still no match, leave unmapped
    if (!mapping[header]) {
      mapping[header] = "";
    }
  }

  return mapping;
}

export type ColumnMapping = Record<string, keyof ContactImportSchema | "">;

export function useColumnMapping(csvHeaders: string[]) {
  const initialMapping = useMemo(
    () => autoMatchHeaders(csvHeaders),
    [csvHeaders]
  );

  const [mapping, setMapping] = useState<ColumnMapping>(initialMapping);

  const updateMapping = useCallback(
    (csvHeader: string, crmField: keyof ContactImportSchema | "") => {
      setMapping((prev) => {
        const newMapping = { ...prev };

        // If another CSV header was already mapped to this CRM field, unmap it
        if (crmField) {
          for (const [key, value] of Object.entries(newMapping)) {
            if (value === crmField && key !== csvHeader) {
              newMapping[key] = "";
            }
          }
        }

        newMapping[csvHeader] = crmField;
        return newMapping;
      });
    },
    []
  );

  const isValid = useMemo(() => {
    const mappedFields = new Set(Object.values(mapping).filter(Boolean));
    return CRM_FIELDS.filter((f) => f.required).every((f) =>
      mappedFields.has(f.key)
    );
  }, [mapping]);

  const applyMapping = useCallback(
    (rows: Record<string, string>[]): ContactImportSchema[] => {
      return rows.map((row) => {
        const mapped: Partial<ContactImportSchema> = {};
        for (const [csvHeader, crmField] of Object.entries(mapping)) {
          if (crmField && row[csvHeader] !== undefined) {
            mapped[crmField] = row[csvHeader];
          }
        }
        return mapped as ContactImportSchema;
      });
    },
    [mapping]
  );

  return {
    mapping,
    updateMapping,
    isValid,
    applyMapping,
  };
}
