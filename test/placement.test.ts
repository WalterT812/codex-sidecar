import test from 'node:test';import assert from 'node:assert/strict';import {drawerPlacement} from '../src/renderer/placement.js';
test('drawer sits left of the native pinned summary without overlap',()=>{
 const native={left:2246,right:2546,top:94,bottom:526,width:300,height:432};const result=drawerPlacement(2562,1394,[native]);
 assert.ok(2562-result.right<=native.left-12);assert.ok(2562-result.right-result.width>312);
});
test('narrow windows place the drawer below the summary if there is room',()=>{
 const result=drawerPlacement(600,950,[{left:284,right:584,top:94,bottom:526,width:300,height:432}]);assert.equal(result.top,538);assert.ok(result.width<600);
});
