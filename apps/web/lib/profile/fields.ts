// Canonical autofill keys. The extension (phase 5) maps form fields onto these;
// anything else the user answers is stored as a learned key.
export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "email" | "tel" | "url" | "textarea" | "select" | "date" | "number";
  options?: string[];
  placeholder?: string;
};

export type FieldGroup = { title: string; description?: string; fields: FieldDef[] };

const YES_NO = ["Yes", "No"];

export const FIELD_GROUPS: FieldGroup[] = [
  {
    title: "Personal",
    fields: [
      { key: "first_name", label: "First name" },
      { key: "last_name", label: "Last name" },
      { key: "preferred_name", label: "Preferred name" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "tel", placeholder: "+91 98765 43210" },
      { key: "address_line1", label: "Street address" },
      { key: "city", label: "City" },
      { key: "state", label: "State / region" },
      { key: "country", label: "Country" },
      { key: "postal_code", label: "Postal code" },
    ],
  },
  {
    title: "Links",
    fields: [
      { key: "linkedin_url", label: "LinkedIn", type: "url" },
      { key: "github_url", label: "GitHub", type: "url" },
      { key: "portfolio_url", label: "Portfolio / website", type: "url" },
      { key: "twitter_url", label: "X / Twitter", type: "url" },
    ],
  },
  {
    title: "Current role",
    fields: [
      { key: "current_title", label: "Current title" },
      { key: "current_company", label: "Current company" },
      { key: "years_experience", label: "Total years of experience", type: "number" },
      { key: "notice_period", label: "Notice period", placeholder: "e.g. 30 days" },
      { key: "current_salary", label: "Current compensation", placeholder: "e.g. ₹18 LPA" },
      { key: "expected_salary", label: "Expected compensation" },
      { key: "earliest_start_date", label: "Earliest start date", type: "date" },
    ],
  },
  {
    title: "Work preferences & authorization",
    fields: [
      { key: "work_authorization", label: "Work authorization", placeholder: "e.g. Indian citizen; no US work permit" },
      { key: "requires_sponsorship", label: "Requires visa sponsorship?", type: "select", options: YES_NO },
      { key: "willing_to_relocate", label: "Willing to relocate?", type: "select", options: YES_NO },
      { key: "preferred_work_mode", label: "Preferred work mode", type: "select", options: ["Remote", "Hybrid", "Onsite", "Any"] },
      { key: "preferred_locations", label: "Preferred locations" },
    ],
  },
  {
    title: "Education",
    fields: [
      { key: "highest_degree", label: "Highest degree", placeholder: "e.g. B.Tech" },
      { key: "field_of_study", label: "Field of study" },
      { key: "university", label: "University" },
      { key: "graduation_year", label: "Graduation year", type: "number" },
    ],
  },
  {
    title: "Short answers",
    description: "Reused for common free-text questions.",
    fields: [
      { key: "short_bio", label: "Short bio", type: "textarea" },
      { key: "cover_letter", label: "Default cover letter", type: "textarea" },
      { key: "how_did_you_hear", label: "How did you hear about us?", placeholder: "e.g. LinkedIn" },
    ],
  },
  {
    title: "Voluntary self-identification",
    description: "Optional. Only used for US-style EEO questions.",
    fields: [
      { key: "gender", label: "Gender", type: "select", options: ["Male", "Female", "Non-binary", "Decline to self-identify"] },
      { key: "pronouns", label: "Pronouns" },
      { key: "veteran_status", label: "Veteran status", type: "select", options: ["I am not a protected veteran", "I am a protected veteran", "Decline to self-identify"] },
      { key: "disability_status", label: "Disability status", type: "select", options: ["No", "Yes", "Decline to self-identify"] },
    ],
  },
];

export const CANONICAL_KEYS = new Set(FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.key)));

/** Normalises a free-text question into a stable learned key. */
export function learnedKey(question: string): string {
  return question
    .toLowerCase()
    .replace(/[*:?]+\s*$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 200);
}
