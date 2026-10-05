import { growthbookAdapter } from './growthbook';
import { statsigAdapter } from './statsig';
import { posthogAdapter } from './posthog';
import type { PageAdapter } from '../core/hooks/runtime';
import { abTastyAdapter } from './ab-tasty';
import { adobeTargetAdapter } from './adobe-target';
import { convertAdapter } from './convert';
import { dynamicYieldAdapter } from './dynamic-yield';
import { kameleoonAdapter } from './kameleoon';
import { monetateAdapter } from './monetate';
import { oneSignalAdapter } from './onesignal';
import { optimizelyAdapter } from './optimizely';
import { pageSenseAdapter } from './pagesense';
import { unbounceAdapter } from './unbounce';
import { vwoAdapter } from './vwo';

export const adapters: PageAdapter[] = [growthbookAdapter, statsigAdapter, posthogAdapter, optimizelyAdapter, adobeTargetAdapter, vwoAdapter, kameleoonAdapter, abTastyAdapter, convertAdapter, dynamicYieldAdapter, unbounceAdapter, monetateAdapter, pageSenseAdapter, oneSignalAdapter];
