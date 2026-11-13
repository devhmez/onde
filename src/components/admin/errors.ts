// Human messages for the data layer's locale-agnostic field codes (FieldErrorCode in src/server/types.ts).
const MESSAGES: Record<string, string> = {
  required: "Required.",
  invalid: "Invalid value.",
  invalid_phone: "Enter a valid Tunisian number (8 digits).",
  invalid_email: "Enter a valid email address.",
  invalid_url: "Enter a valid link (https://…).",
  invalid_governorate: "Choose a governorate from the list.",
  too_long: "Too long.",
  too_many: "Too many items.",
  unavailable: "This product is unavailable.",
  taken: "Already used by another record.",
};

export const fieldMessage = (code: string) => MESSAGES[code] ?? code;

export function mapFieldCodes(fields: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!fields) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fieldMessage(v);
  return Object.keys(out).length ? out : undefined;
}
