import { Badge } from "@shopify/polaris";

export type RuleTypeBadgeTone = "attention" | "info";

export function getRuleTypeBadgeTone(ruleType: string): RuleTypeBadgeTone {
  return ruleType.trim().toLowerCase() === "block" ? "attention" : "info";
}

interface RuleTypeBadgeProps {
  ruleType: string;
  label?: string;
}

export function RuleTypeBadge({ ruleType, label }: RuleTypeBadgeProps) {
  const isBlock = ruleType.trim().toLowerCase() === "block";

  return (
    <Badge tone={getRuleTypeBadgeTone(ruleType)}>
      {label || (isBlock ? "Block" : "Redirect")}
    </Badge>
  );
}
