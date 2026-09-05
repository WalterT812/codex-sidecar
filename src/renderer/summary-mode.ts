/** Sidecar and the native pinned summary share one right-side position. */
export function createSummaryMode(doc:Document, closeSidecar:()=>void){
 const selector='header button[aria-label="Toggle pinned summary"]';
 let restore=false,opened=false,internal=false;
 const button=()=>Array.from(doc.querySelectorAll<HTMLButtonElement>(selector)).find(node=>node.getBoundingClientRect().width>0);
 function click(node:HTMLButtonElement){internal=true;try{node.click();}finally{internal=false;}}
 function setOpen(value:boolean){
  if(value===opened)return;opened=value;
  const toggle=button();
  if(value){restore=toggle?.getAttribute('aria-pressed')==='true';if(restore&&toggle)click(toggle);}
  else{if(restore&&toggle?.getAttribute('aria-pressed')==='false')click(toggle);restore=false;}
 }
 const onClick=(event:Event)=>{
   if(internal||!opened)return;
   const target=(event.target as Element|null)?.closest?.(selector);
   if(!target)return;
   // A direct user click chooses the native summary. Do not toggle it a second time.
   restore=false;opened=false;closeSidecar();
 };
 doc.addEventListener('click',onClick,true);
 return{setOpen,destroy(){doc.removeEventListener('click',onClick,true);setOpen(false);}};
}
