/** The code in /for-business/<code>, or null. */
export function pitchCodeFromPath(pathname: string): string | null {
  const match = /^\/for-business\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\/?$/.exec(pathname);
  return match ? match[1] : null;
}
