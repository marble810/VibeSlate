import { wakeLockStatus } from './stores';

interface WakeLockSentinelLike extends EventTarget {
  released: boolean;
  release: () => Promise<void>;
}

interface NavigatorWithWakeLock extends Navigator {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
}

let sentinel: WakeLockSentinelLike | null = null;
let retryOnGesture = false;

function supportsWakeLock(): boolean {
  return Boolean((navigator as NavigatorWithWakeLock).wakeLock);
}

async function requestWakeLock(): Promise<void> {
  if (!supportsWakeLock()) {
    wakeLockStatus.set('unsupported');
    return;
  }

  if (document.visibilityState !== 'visible') {
    wakeLockStatus.set(sentinel && !sentinel.released ? 'active' : 'released');
    return;
  }

  if (sentinel && !sentinel.released) {
    wakeLockStatus.set('active');
    return;
  }

  try {
    wakeLockStatus.set('requesting');
    sentinel = await (navigator as NavigatorWithWakeLock).wakeLock!.request('screen');
    retryOnGesture = false;
    wakeLockStatus.set('active');

    sentinel.addEventListener('release', () => {
      sentinel = null;
      wakeLockStatus.set(document.visibilityState === 'visible' ? 'released' : 'unsupported');
    });
  } catch (err) {
    sentinel = null;
    retryOnGesture = true;
    wakeLockStatus.set(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'released');
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void requestWakeLock();
  }
}

function handleGestureRetry() {
  if (!retryOnGesture) return;
  void requestWakeLock();
}

export function connectWakeLock(): () => void {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  void requestWakeLock();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pointerdown', handleGestureRetry, { passive: true });
  window.addEventListener('keydown', handleGestureRetry);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pointerdown', handleGestureRetry);
    window.removeEventListener('keydown', handleGestureRetry);
    void sentinel?.release().catch(() => {});
    sentinel = null;
  };
}
