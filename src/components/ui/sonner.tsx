"use client";

import { useTheme } from "next-themes@0.4.6";
import { Toaster as Sonner, ToasterProps } from "sonner@2.0.3";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "#020617",
          "--normal-text": "#f8fafc",
          "--normal-border": "#38bdf8",
          "--success-bg": "#064e3b",
          "--success-text": "#ecfdf5",
          "--success-border": "#34d399",
          "--error-bg": "#7f1d1d",
          "--error-text": "#fef2f2",
          "--error-border": "#fca5a5",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
