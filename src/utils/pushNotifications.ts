/**
 * Browser push is retired with the PWA. Native APNs is the only live path.
 */
export function isPushSupported(): boolean {
  return false;
}

export function getPermissionState(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

export async function isSubscribed(): Promise<boolean> {
  return false;
}

export async function subscribeToPush(): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'Web push is retired. Use the native Bytspot app.' };
}

export async function unsubscribeFromPush(): Promise<boolean> {
  return true;
}
