import type { NormalizedExperiment, PlatformId } from './model';
type Kind = NormalizedExperiment['kind'];
// Only explicit vendor metadata determines a type; variation count is not evidence.
export function activityKind(platform: PlatformId, raw: any): Kind {
  const values = [raw?.type, raw?.testType, raw?.experimentType, raw?.activityType, raw?.campaignType, raw?.experienceType, raw?.['activity.type']];
  for (const value of values) {
    const type = String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (platform === 'vwo') { if (type === 'vis') return 'ab'; if (type === 'split') return 'split-url'; if (type === 'personalize') return 'personalization'; }
    if (['ab', 'abtest', 'abtesting', 'abexperiment', 'abexperience', 'abtestexperience', 'autoallocate', 'autoallocatetest'].includes(type)) return 'ab';
    if (['personalization', 'personalisation', 'personalizationexperience', 'personalisationexperience', 'targeting', 'targeted', 'xt', 'experiencetargeting', 'autotarget', 'automatedpersonalization', 'ap'].includes(type)) return 'personalization';
    if (['mvt', 'multivariate', 'multivariatetest'].includes(type)) return 'mvt';
    if (['redirect', 'redirecttest', 'split', 'spliturl', 'spliturltest'].includes(type)) return 'split-url';
    if (['feature', 'featureflag', 'featuretest', 'featureexperiment'].includes(type)) return 'feature-flag';
    if (['recommendation', 'recommendations'].includes(type)) return 'recommendation';
    if (['survey', 'poll'].includes(type)) return 'survey';
  }
  return 'other';
}
