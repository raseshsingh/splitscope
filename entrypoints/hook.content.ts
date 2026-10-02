import { adapters } from '../src/adapters';
import { installHookEngine } from '../src/core/hooks/install';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    installHookEngine(adapters);
  }
});
