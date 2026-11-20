import { Badge } from "@shopify/polaris";

export type RuleTypeBadgeTone = "attention" | "info" | "success";

export function getRuleTypeBadgeTone(ruleType: string): RuleTypeBadgeTone {
  const type = ruleType.trim().toLowerCase();
  if (type === "block") return "attention";
  if (type === "allow") return "success";
  return "info";
}

function defaultLabel(ruleType: string) {
  const type = ruleType.trim().toLowerCase();
  if (type === "block") return "Block";
  if (type === "allow") return "Allow";
  return "Redirect";
}

interface RuleTypeBadgeProps {
  ruleType: string;
  label?: string;
}

export function RuleTypeBadge({ ruleType, label }: RuleTypeBadgeProps) {
  return (
    <Badge tone={getRuleTypeBadgeTone(ruleType)}>
      {label || defaultLabel(ruleType)}
    </Badge>
  );
}
