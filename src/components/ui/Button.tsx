import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 " +
  "text-sm font-bold transition " +
  "active:scale-[0.97] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas " +
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 " +
  "motion-reduce:transition-none motion-reduce:active:scale-100";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-primary to-primary-hi text-on-primary shadow-sm hover:brightness-105",
  secondary:
    "border-[1.5px] border-primary text-primary bg-transparent hover:bg-primary/10",
  danger: "bg-danger text-white hover:brightness-110",
  ghost: "text-muted bg-transparent hover:text-heading hover:bg-black/5 dark:hover:bg-white/5",
};

export function Button({
  variant = "primary",
  className = "",
  type = "submit",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
