"use client";

import type { CSSProperties, ReactNode } from "react";

export function ConfirmForm({
  action,
  confirmMessage,
  children,
  className,
  style,
}: {
  action: (formData: FormData) => void | Promise<void>;
  confirmMessage: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <form
      action={action}
      className={className}
      style={style}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </form>
  );
}
