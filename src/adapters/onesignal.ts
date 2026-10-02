import type { PageAdapter } from '../core/hooks/runtime';
import { detection } from '../core/hooks/runtime';
import { sanitize } from '../core/sanitize';

export const oneSignalAdapter: PageAdapter = {
  id: 'onesignal', displayName: 'OneSignal', category: 'engagement',
  detect() {
    const win = window as any;
    if (win.OneSignal || win.OneSignalDeferred) return detection(win.OneSignal?.Notifications ? 'active' : 'loading', ['OneSignal Web SDK global or queue'], 0.98);
    if (document.querySelector('script[src*="onesignal.com/sdks/web/"]')) return detection('loading', ['OneSignal Web SDK script'], 0.78);
    return detection('blocked', [], 0);
  },
  listExperiments() { return []; },
  install(helpers) {
    const win = window as any;
    helpers.wrapQueue('OneSignalDeferred', 'onesignal', () => 'OneSignalDeferred.push', 'lifecycle');
    helpers.wrapQueue('OneSignal', 'onesignal', () => 'OneSignal.push', 'lifecycle');
    for (const method of ['login', 'logout', 'setConsentGiven', 'setConsentRequired']) helpers.wrapMethod(() => win.OneSignal, method, 'onesignal', () => `OneSignal.${method}`, 'identity');
    for (const method of ['addTag', 'addTags', 'removeTag', 'removeTags', 'addEmail', 'removeEmail', 'addSms', 'removeSms']) helpers.wrapMethod(() => win.OneSignal?.User, method, 'onesignal', () => `OneSignal.User.${method}`, 'identity');
    helpers.wrapMethod(() => win.OneSignal?.Session, 'sendOutcome', 'onesignal', () => 'OneSignal.Session.sendOutcome', 'goal');
    helpers.wrapMethod(() => win.OneSignal?.Notifications, 'addEventListener', 'onesignal', (args) => `Notifications.addEventListener(${String(args[0])})`, 'lifecycle');
    helpers.wrapMethod(() => win.OneSignal?.User?.PushSubscription, 'addEventListener', 'onesignal', () => 'PushSubscription.addEventListener', 'lifecycle');
    const user = win.OneSignal?.User;
    if (user) helpers.emit({ platform: 'onesignal', category: 'identity', name: 'OneSignal user state', via: 'listener', properties: sanitize({ externalId: user.externalId, onesignalId: user.onesignalId, subscriptionId: user.PushSubscription?.id, optedIn: user.PushSubscription?.optedIn }) });
  }
};
