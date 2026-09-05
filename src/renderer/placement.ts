export interface Box { left:number; right:number; top:number; bottom:number; width:number; height:number }
/** A bottom-right popover: native summaries only limit height, never move it sideways. */
export function drawerPlacement(width:number,height:number,obstacles:Box[],headerBottom=56) {
 const right=16,bottom=72,drawerWidth=Math.max(0,Math.min(390,width-32));
 let ceiling=headerBottom+12;
 for(const box of obstacles){
  if(box.width>0&&box.height>0&&box.right>width-right-drawerWidth&&box.left<width-right&&box.top<height&&box.bottom>0){
   ceiling=Math.max(ceiling,box.bottom+12);
  }
 }
 const drawerHeight=Math.max(0,Math.min(640,height-bottom-ceiling));
 return{right,bottom,width:drawerWidth,height:drawerHeight,top:height-bottom-drawerHeight};
}
