/**
 * Type declarations for external modules that may not be installed locally.
 * - Capacitor native plugins: only available inside iOS/Android builds
 * - @bytspot-api: sibling repo, not present in CI
 *
 * These stubs allow TypeScript to compile without the actual packages.
 * At runtime, dynamic imports with try/catch handle missing modules gracefully.
 */

// ── Capacitor Haptics ─────────────────────────────────────────────
declare module '@capacitor/haptics' {
  export enum ImpactStyle {
    Heavy = 'HEAVY',
    Medium = 'MEDIUM',
    Light = 'LIGHT',
  }
  export enum NotificationType {
    Success = 'SUCCESS',
    Warning = 'WARNING',
    Error = 'ERROR',
  }
  export const Haptics: {
    impact(options: { style: ImpactStyle }): Promise<void>;
    notification(options: { type: NotificationType }): Promise<void>;
    selectionChanged(): Promise<void>;
    vibrate(options?: { duration?: number }): Promise<void>;
  };
}

// ── Capacitor Share ───────────────────────────────────────────────
declare module '@capacitor/share' {
  export const Share: {
    share(options: {
      title?: string;
      text?: string;
      url?: string;
      dialogTitle?: string;
    }): Promise<{ activityType?: string }>;
    canShare(): Promise<{ value: boolean }>;
  };
}

// ── Capacitor Badge ───────────────────────────────────────────────
declare module '@capacitor/badge' {
  export const Badge: {
    set(options: { count: number }): Promise<void>;
    get(): Promise<{ count: number }>;
    clear(): Promise<void>;
    increase(): Promise<void>;
    decrease(): Promise<void>;
    isSupported(): Promise<{ isSupported: boolean }>;
    requestPermission(): Promise<{ display: string }>;
    checkPermission(): Promise<{ display: string }>;
  };
}

// ── Bytspot API (sibling repo — not available in CI) ──────────────
declare module '@bytspot-api/trpc/router' {
  import type { AnyRouter } from '@trpc/server';
  export type AppRouter = AnyRouter;
}
