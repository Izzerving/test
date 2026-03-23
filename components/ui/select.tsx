"use client";

import { cn } from "@/lib/utils";

export type SelectOption = { label: string; value: string };

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  disabled
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
      className={cn(
        "flex h-10 w-full rounded-md border border-border bg-zinc-950 px-3 py-2 text-sm text-white outline-none transition focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
