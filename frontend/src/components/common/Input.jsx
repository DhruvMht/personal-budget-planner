import { useId } from "react";

export default function Input({
  label,
  error,
  id,
  className = "",
  as = "input",
  icon: Icon,
  children,
  allowSpecialCharacters = false,
  ...props
}) {
  const generatedId = useId();
  const inputId = id || props.name || generatedId;
  const Tag = as;
  const plainText = !allowSpecialCharacters && as === "input" && [undefined, "text", "search"].includes(props.type);
  const characterError = plainText && typeof props.value === "string" && props.value !== "" && !/^[\p{L}\p{M}\p{N} ]+$/u.test(props.value)
    ? "Incorrect value: only letters, numbers and spaces are allowed." : "";
  const displayedError = error || characterError;
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <Tag
          id={inputId}
          className={`field ${Icon ? "pl-10" : ""} ${displayedError ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/10 dark:border-rose-800" : ""}`}
          pattern={plainText ? "[\\p{L}\\p{M}\\p{N} ]+" : undefined}
          title={plainText ? "Letters, numbers and spaces only. No special characters." : undefined}
          aria-invalid={displayedError ? true : undefined}
          aria-describedby={displayedError ? `${inputId}-error` : undefined}
          {...props}
        >
          {children}
        </Tag>
      </div>
      {displayedError && (
        <p id={`${inputId}-error`} className="text-xs font-medium text-rose-600 dark:text-rose-400">{displayedError}</p>
      )}
    </div>
  );
}

