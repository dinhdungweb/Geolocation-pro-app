import styles from "./rule-status-switch.module.css";

interface RuleStatusSwitchProps {
    checked: boolean;
    disabled?: boolean;
    label: string;
    loading?: boolean;
    onChange: (checked: boolean) => void;
}

export function RuleStatusSwitch({
    checked,
    disabled = false,
    label,
    loading = false,
    onChange,
}: RuleStatusSwitchProps) {
    const className = [
        styles.switch,
        checked ? styles.checked : "",
        loading ? styles.loading : "",
    ].filter(Boolean).join(" ");

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            aria-busy={loading || undefined}
            className={className}
            disabled={disabled || loading}
            onClick={() => onChange(!checked)}
        >
            <span className={styles.thumb} aria-hidden="true" />
        </button>
    );
}
