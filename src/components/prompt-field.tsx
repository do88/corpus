import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * The box you type a meal into.
 *
 * Two screens ask the same kind of question — "what did you eat" on Today,
 * "what have you got in" on the advisor — and they had drifted into two
 * different controls. The composer had been given a drawn border and a lit
 * inner edge; the advisor still wore the older recessed treatment, which on a
 * bright screen left it without a visible edge at all. Same question, same
 * control, one definition.
 *
 * `field-sizing-content` on the underlying textarea means it grows with what
 * is typed, which is why `rows` is a starting height rather than a fixed one.
 *
 * Enter submits and Shift+Enter makes a new line — the convention every
 * messaging app has already taught everyone, and worth stating in one place so
 * the two screens cannot disagree about it.
 */
export function PromptField({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  rows = 1,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Enter submits when given. Omit for a field with no primary action. */
  onSubmit?: () => void;
  placeholder: string;
  /** The accessible name. The placeholder is an example, not a label. */
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <Textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      aria-label={label}
      className={cn(
        "max-h-40 w-full resize-none bg-[var(--elevated)] px-3.5 py-2.5 leading-normal focus-visible:ring-0",
        className,
      )}
      style={{
        borderRadius: 16,
        border: "1px solid var(--input)",
        // A hairline of shadow along the top edge — the inverse of the card's
        // specular highlight, so the field reads as set into the surface.
        boxShadow: "inset 0 1px 2px color-mix(in oklch, var(--foreground) 5%, transparent)",
      }}
      onKeyDown={(event) => {
        if (!onSubmit) return;
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onSubmit();
        }
      }}
    />
  );
}
