"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";

interface PasswordValidatorProps {
    password: string;
}

interface Rule {
    label: string;
    test: (pw: string) => boolean;
}

const RULES: Rule[] = [
    { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
    { label: "Contains uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
    { label: "Contains lowercase letter", test: (pw) => /[a-z]/.test(pw) },
    { label: "Contains a number", test: (pw) => /\d/.test(pw) },
    { label: "Contains a special character", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function usePasswordStrength(password: string) {
    return useMemo(() => {
        const results = RULES.map((r) => ({ ...r, passed: r.test(password) }));
        const allPassed = results.every((r) => r.passed);
        return { results, allPassed };
    }, [password]);
}

export default function PasswordValidator({ password }: PasswordValidatorProps) {
    const { results } = usePasswordStrength(password);

    if (!password) return null;

    return (
        <ul className="space-y-1.5 mt-2 mb-1">
            {results.map((r) => (
                <li
                    key={r.label}
                    className={`flex items-center gap-2 text-xs transition-colors ${r.passed ? "text-green-600" : "text-text-tertiary"
                        }`}
                >
                    {r.passed ? (
                        <Check className="w-3 h-3 shrink-0" />
                    ) : (
                        <X className="w-3 h-3 shrink-0" />
                    )}
                    {r.label}
                </li>
            ))}
        </ul>
    );
}
