let cleanup: (() => void) | undefined;
export function clearHighlight() { cleanup?.(); cleanup = undefined; }
export function highlightSelector(selector: string): { count: number; error?: string } {
  clearHighlight();
  let elements: Element[];
  try { elements = Array.from(document.querySelectorAll(selector)); } catch { return { count: 0, error: 'This is not a valid CSS selector.' }; }
  if (!elements.length) return { count: 0 };
  // Bring the first match into view; otherwise the highlight is invisible for off-screen elements.
  try { const first = elements[0]!, box = first.getBoundingClientRect(); if (box.bottom < 0 || box.top > window.innerHeight) first.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); } catch {}
  const overlay = document.createElement('div');
  overlay.setAttribute('data-splitscope-highlight', '');
  overlay.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483646';
  document.documentElement.append(overlay);
  const update = () => {
    overlay.replaceChildren();
    for (const element of elements.slice(0, 100)) {
      const rect = element.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;box-sizing:border-box;border:2px solid #2451d6;background:rgba(36,81,214,.08);pointer-events:none;left:' + rect.left + 'px;top:' + rect.top + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px';
      overlay.append(box);
    }
  };
  update();
  window.addEventListener('scroll', update, true); window.addEventListener('resize', update);
  const timer = setTimeout(clearHighlight, 5000);
  cleanup = () => { clearTimeout(timer); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); overlay.remove(); };
  return { count: elements.length };
}
