export interface RuleImportValidation {
  isValid: boolean;
  count: number;
  message: string;
}

export interface RuleImportLabels {
  singular: string;
  plural: string;
}

export function validateRuleImportJson(
  value: string,
  labels: RuleImportLabels,
): RuleImportValidation {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return {
        isValid: false,
        count: 0,
        message: `This file can't be imported because its top-level JSON value isn't an array of ${labels.plural}. Use a file created by Export, or wrap the ${labels.plural} in a JSON array.`,
      };
    }

    return {
      isValid: true,
      count: parsed.length,
      message: `Found ${parsed.length} ${parsed.length === 1 ? labels.singular : labels.plural} ready to import.`,
    };
  } catch {
    return {
      isValid: false,
      count: 0,
      message: "This file can't be imported because it isn't valid JSON. Check the file and try again.",
    };
  }
}
