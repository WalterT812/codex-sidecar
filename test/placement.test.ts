import test from 'node:test';import assert from 'node:assert/strict';import {drawerPlacement} from '../src/renderer/placement.js';
const native={left:2246,right:2546,top:94,bottom:526,width:300,height:432};
test('summary and drawer coexist vertically without any horizontal displacement',()=>{
 const plain=drawerPlacement(2562,1394,[]),result=drawerPlacement(2562,1394,[native]);
 assert.equal(result.right,plain.right);assert.equal(result.bottom,plain.bottom);assert.equal(result.width,plain.width);
 assert.ok(result.top>=native.bottom+12);assert.equal(result.height,640);
});
test('a smaller viewport caps the popup height below the summary',()=>{
 const result=drawerPlacement(600,950,[{...native,left:284,right:584}]);
 assert.equal(result.top,538);assert.equal(result.height,340);assert.equal(result.right,16);
});
test('insufficient vertical space never overlaps the summary',()=>{
 const result=drawerPlacement(600,600,[{...native,left:284,right:584}]);assert.equal(result.height,0);
});
test('offscreen summaries are ignored and small windows stay within viewport',()=>{
 const result=drawerPlacement(320,500,[native],82);assert.equal(result.width,288);assert.equal(result.top,94);assert.equal(result.height,334);
});
