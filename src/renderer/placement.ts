export interface Box { left:number; right:number; top:number; bottom:number; width:number; height:number }
/** Place the companion beside a native pinned summary, or below it on narrow windows. */
export function drawerPlacement(width:number,height:number,obstacles:Box[]) {
 let right=43,top=68;let drawerWidth=Math.min(362,width-56);
 const visible=obstacles.filter(b=>b.width>0&&b.height>0&&b.right>0&&b.left<width&&b.top<height&&b.bottom>top);
 for(const box of visible){
  const left=width-right-drawerWidth;
  if(box.left<width-right&&box.right>left){
    const beside=width-box.left+12;
    if(width-beside-drawerWidth>=12)right=Math.max(right,beside);
    else if(height-box.bottom-26>=180)top=Math.max(top,box.bottom+12);
    else{drawerWidth=Math.max(160,box.left-24);right=width-box.left+12;}
  }
 }
 return{right,top,width:drawerWidth,railRight:Math.max(0,right-35)};
}
