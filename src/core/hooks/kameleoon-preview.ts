/** Run once when the engine is ready, persist the override, then apply on a clean load. */
export function queueKameleoonPreview(win: any, marker: string, cleanUrl: string, navigate: (url: string) => void, report: (message: string, error?: unknown) => void): void {
  if (!/^\d+:\d+$/.test(marker)) throw new Error('Invalid Kameleoon preview IDs.');
  const [experimentId, variationId] = marker.split(':').map(Number);
  if (![experimentId, variationId].every(Number.isSafeInteger)) throw new Error('Invalid Kameleoon preview IDs.');
  const apply = () => {
    try {
      const api = win.Kameleoon?.API?.Experiments;
      const experiment = api?.getById?.(experimentId);
      if (!experiment) throw new Error('The requested experiment is unavailable on this page. Use its vendor simulation link.');
      if (!experiment.variations?.some((v: any) => Number(v.id) === variationId)) throw new Error('The requested variation is unavailable in this experiment.');
      // Without overwrite=true an existing registeredVariationId wins (Accor engine).
      api.assignVariation(experimentId, variationId, true);
      const assigned = api.getById(experimentId)?.associatedVariation?.id;
      if (Number(assigned) !== variationId || assigned == null) throw new Error('Kameleoon did not confirm the requested assignment.');
      report(`Kameleoon saved variation ${variationId} for experiment ${experimentId}; reloading to apply it.`);
      navigate(cleanUrl);
    } catch (error) { report('Kameleoon preview could not be applied', error); }
  };
  (win.kameleoonQueue || (win.kameleoonQueue = [])).push(apply);
}
