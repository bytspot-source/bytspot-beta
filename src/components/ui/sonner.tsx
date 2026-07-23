"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const highContrastToastOptions: NonNullable<ToasterProps["toastOptions"]> = {
  style: {
    background: "#e2e8f0",
    border: "1px solid #94a3b8",
    boxShadow: "0 26px 80px rgba(15, 23, 42, 0.36)",
    color: "#020617",
  },
  classNames: {
    toast: "bytspot-toast !rounded-[18px] !bg-slate-100 !text-slate-950 !border !border-slate-300 !shadow-[0_26px_80px_rgba(15,23,42,0.35)]",
    title: "!text-slate-950 !font-black !text-[15px] !leading-snug",
    description: "!text-slate-950 !font-semibold !text-[14px] !leading-snug !opacity-100",
    closeButton: "!bg-slate-950 !text-white !border-slate-700",
    actionButton: "!bg-slate-950 !text-white !font-bold",
    cancelButton: "!bg-slate-200 !text-slate-950 !font-bold",
  },
};

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const mergedToastOptions: ToasterProps["toastOptions"] = {
    ...highContrastToastOptions,
    ...props.toastOptions,
    style: {
      ...highContrastToastOptions.style,
      ...props.toastOptions?.style,
      background: "#e2e8f0",
      color: "#020617",
      border: "1px solid #94a3b8",
      backdropFilter: "none",
    },
    classNames: {
      ...highContrastToastOptions.classNames,
      ...props.toastOptions?.classNames,
      toast: `${highContrastToastOptions.classNames?.toast ?? ""} ${props.toastOptions?.classNames?.toast ?? ""}`.trim(),
      title: `${highContrastToastOptions.classNames?.title ?? ""} ${props.toastOptions?.classNames?.title ?? ""}`.trim(),
      description: `${highContrastToastOptions.classNames?.description ?? ""} ${props.toastOptions?.classNames?.description ?? ""}`.trim(),
    },
  };

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "#e2e8f0",
          "--normal-text": "#020617",
          "--normal-border": "#94a3b8",
          "--success-bg": "#f0fdf4",
          "--success-text": "#052e16",
          "--success-border": "#22c55e",
          "--error-bg": "#fef2f2",
          "--error-text": "#450a0a",
          "--error-border": "#ef4444",
        } as React.CSSProperties
      }
      {...props}
      toastOptions={mergedToastOptions}
    />
  );
};

export { Toaster };
