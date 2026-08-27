import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// The VAPID public key identifies this app to the push service (FCM, etc.) --
// pushManager.subscribe() needs it as a raw Uint8Array, not the base64url
// string it's stored/shipped as.
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function usePushNotifications() {
  const { user } = useAuth();
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  const supported =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && !!vapidPublicKey;

  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supported) {
      setLoading(false);
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    setSubscribed(!!existing);
    setLoading(false);
  }, [supported]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = async () => {
    if (!supported || !user || !vapidPublicKey) return { error: 'Not supported on this device/browser' };
    setError(null);

    // A user who previously denied the permission gets silently re-rejected by
    // Notification.requestPermission() rather than a fresh prompt -- surface
    // that distinctly so Settings can point them at their browser's site
    // settings instead of just "something went wrong".
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      const message = permission === 'denied' ? 'Notifications are blocked for this site in your browser settings.' : 'Permission was not granted.';
      setError(message);
      return { error: message };
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
        }));

      const json = subscription.toJSON();
      const { error: dbError } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth,
        },
        { onConflict: 'endpoint' },
      );
      if (dbError) {
        setError(dbError.message);
        return { error: dbError.message };
      }

      setSubscribed(true);
      return { error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not enable notifications';
      setError(message);
      return { error: message };
    }
  };

  const disable = async () => {
    if (!supported) return { error: null };
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
      await subscription.unsubscribe();
    }
    setSubscribed(false);
    return { error: null };
  };

  return { supported, subscribed, loading, error, enable, disable };
}
