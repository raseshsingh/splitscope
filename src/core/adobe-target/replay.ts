/** A deliberately limited local text replay. Never evaluates offer HTML, JS or CSS. */
export function replayText(selector:string,text:string) {
 if(!selector||selector.length>2000||text.length>20000)throw new Error('Replay content or selector exceeds the limit.');
 const nodes=document.querySelectorAll(selector);
 if(nodes.length!==1)throw new Error('Text replay requires exactly one matching element.');
 const node=nodes[0]!;
 if(node.closest('splitscope-panel')||['HTML','BODY','HEAD','SCRIPT','STYLE','INPUT','TEXTAREA','SELECT','IFRAME','FORM'].includes(node.tagName))throw new Error('This element cannot be replayed.');
 const originals=[...node.childNodes];const replacement=document.createTextNode(text);node.replaceChildren(replacement);
 return ()=>{if(node.childNodes.length!==1||node.firstChild!==replacement)return false;node.replaceChildren(...originals);return true;};
}
