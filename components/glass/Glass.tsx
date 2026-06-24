import type { ElementType, ReactNode } from "react";

// Performant static liquid-glass surface. Used everywhere except the one signature lens.
export function Glass({
  as: Tag = "div",
  strong = false,
  className = "",
  children,
  ...rest
}: {
  as?: ElementType;
  strong?: boolean;
  className?: string;
  children?: ReactNode;
  [key: string]: any;
}) {
  return (
    <Tag className={`glass${strong ? " glass-strong" : ""} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
