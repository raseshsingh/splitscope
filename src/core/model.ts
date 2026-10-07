export type PlatformId =
  | 'growthbook' | 'statsig' | 'posthog' | 'optimizely' | 'adobe-target' | 'vwo' | 'kameleoon' | 'ab-tasty'
  | 'convert' | 'dynamic-yield' | 'unbounce' | 'monetate' | 'pagesense' | 'onesignal';

export type DataSource = 'runtime-api' | 'snippet-data' | 'network' | 'cookie' | 'tokens' | 'dom-event' | 'script';
export type ExperimentStatus = 'running-in' | 'running-excluded' | 'bucketed-elsewhere' | 'not-targeted' | 'not-on-page' | 'preview' | 'unknown';
export type ForceMethod = 'api' | 'url' | 'cookie' | 'preview-link' | 'pre-snippet-api' | 'runtime-api-then-reload';

export interface Capabilities {
  listAll: 'full' | 'partial' | 'none';
  listActive: boolean;
  forceVariation: ForceMethod | 'none';
  trafficSplit: 'full' | 'partial' | 'none';
  changes: 'full' | 'partial' | 'none';
  events: boolean;
  notes: Record<string, string>;
}

export interface DetectionResult {
  state: 'active' | 'loading' | 'waiting-consent' | 'disabled' | 'blocked' | 'detected';
  confidence: number;
  signals: string[];
  version?: string;
  health?: Record<string, unknown>;
}

export interface NamedRef { id?: string; name: string }
export interface NormalizedChange {
  sourcePath?: string;
  codeUnavailable?: string;
  type: 'js' | 'css' | 'html' | 'attribute' | 'redirect' | 'offer' | 'unknown';
  code?: string;
  selector?: string;
  url?: string;
  format?: 'html' | 'json' | 'actions';
  content?: unknown;
  label?: string;
  data?: unknown;
}
export interface NormalizedVariation {
  id: string;
  name: string;
  isControl?: boolean;
  weight?: number;
  changes?: NormalizedChange[];
  raw?: unknown;
}
export interface NormalizedExperiment {
  platform: PlatformId;
  id: string;
  name: string;
  kind: 'ab' | 'mvt' | 'split-url' | 'personalization' | 'feature-flag' | 'layer' | 'configuration' | 'survey' | 'recommendation' | 'other';
  status: ExperimentStatus;
  statusReason?: string;
  evidence?: { state: 'applied' | 'assigned' | 'stored' | 'detected' | 'failed'; observedAt: number; pageUrl: string };
  variations: NormalizedVariation[];
  changes?: NormalizedChange[];
  evaluatedValue?: unknown;
  assignedVariationId?: string;
  trafficAllocation?: number;
  targeting?: { urls?: string[]; audiences?: NamedRef[]; conditions?: string[] };
  goals?: NamedRef[];
  campaignId?: string;
  dashboardContext?: { projectId?: string; accountId?: string; runtime?: 'web' | 'classic' };
  source: DataSource[];
  raw: unknown;
  forced?: boolean;
}
export interface VisitorInfo {
  visitorId?: string;
  consent?: 'granted' | 'required' | 'unknown';
  optedOut?: boolean;
  preview?: boolean;
  values?: Record<string, unknown>;
}
export interface SnippetHealth {
  version?: string;
  projectId?: string;
  revision?: string;
  snippetUrl?: string;
  status?: string;
  elapsedMs?: number;
  raw?: unknown;
}
export interface CookieSpec { name: string; value: string; domain?: string; path?: string; expirationDate?: number }
export type ForcePlan =
  | { method: 'url'; url: string; tracking: 'disabled' | 'counted' | 'unknown'; explanation: string }
  | { method: 'cookie'; set: CookieSpec[]; reload: true; tracking: 'counted' | 'unknown'; explanation: string }
  | { method: 'pre-snippet-api'; commands: unknown[]; reload: true; tracking: 'counted' | 'unknown'; explanation: string }
  | { method: 'runtime-api-then-reload'; op: string; args: unknown[]; reload: true; tracking: 'counted' | 'unknown'; explanation: string }
  | { method: 'preview-link'; url: string; explanation: string };
export interface ForceRequest { experimentId: string; variationId: string; url: string; raw?: unknown }

export type EventCategory = 'custom' | 'goal' | 'revenue' | 'pageview' | 'decision' | 'activation' | 'lifecycle' | 'identity' | 'data-feed' | 'consent' | 'network' | 'error';
export interface CapturedEvent {
  id: string;
  t: number;
  platform: PlatformId | 'datalayer' | 'ga4' | 'segment' | 'adobe-analytics' | 'page';
  pageUrl?: string;
  category: EventCategory;
  name: string;
  properties?: unknown;
  experimentId?: string;
  variationId?: string;
  via: 'api-call' | 'listener' | 'dom-event' | 'network' | 'queued-before-load';
  caller?: string;
  networkRef?: string;
  raw?: unknown;
}

export interface PlatformAdapter {
  id: PlatformId;
  displayName: string;
  capabilities: Capabilities;
  detect(): DetectionResult;
  installHooks(context: AdapterContext): void;
  whenReady(): Promise<{ ready: boolean; elapsedMs?: number; reason?: string }>;
  listExperiments(): NormalizedExperiment[];
  getExperiment(id: string): NormalizedExperiment | null;
  getVisitor(): VisitorInfo;
  getHealth(): SnippetHealth;
  forceVariation?(request: ForceRequest): ForcePlan;
  clearForcing?(): ForcePlan;
  disableUrl?(url: URL): URL;
}

export interface AdapterContext {
  emit: (event: Omit<CapturedEvent, 'id' | 't'>) => void;
  on: (name: string, callback: (detail: unknown) => void) => void;
  wrapQueue: (globalName: string, platform: PlatformId, classify?: (args: unknown[]) => Partial<CapturedEvent>) => void;
  wrapMethod: (target: object | undefined, method: string, platform: PlatformId, classify?: (args: unknown[]) => Partial<CapturedEvent>) => void;
  addCleanup: (cleanup: () => void) => void;
  safeMode: boolean;
}

export interface DetectionRecord {
  id: PlatformId;
  displayName: string;
  result: DetectionResult;
  capabilities: Capabilities;
}

export interface BridgeMessage {
  namespace: '__splitscope__';
  nonce: string;
  type: 'hello' | 'ready' | 'snapshot' | 'event' | 'command' | 'response' | 'status';
  requestId?: string;
  payload?: unknown;
}
