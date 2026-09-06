import type {ResetCredits} from '../shared/types.js';

export function resetCreditsLabel(credits:ResetCredits|undefined,zh=true){
 const count=credits?.availableCount;return zh?`卡 ${count??'—'} 张`:`${count??'—'} reset cards`;
}
export function resetCreditsTooltip(credits:ResetCredits|undefined,zh=true,stale=false){
 const count=credits?.availableCount;
 const rows=[zh?`充值卡（额度重置卡）：${count??'暂时未知'}${count===null||count===undefined?'':' 张可用'}`:`Usage reset cards: ${count??'unknown'}`];
 if(stale)rows.push(zh?'这是上次读取的数据，等待刷新。':'Last known data; awaiting refresh.');
 if(count===0)rows.push(zh?'当前没有可用充值卡。':'No reset cards available.');
 else{
  for(const [index,credit]of (credits?.credits??[]).entries()){
   const at=credit.expiresAt===null?null:new Date(credit.expiresAt*1000);
   const formatted=at?new Intl.DateTimeFormat(zh?'zh-CN':'en-AU',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(at):null;
   rows.push(zh?`${index+1}. ${formatted?formatted+' 到期':'未提供有效期'}`:`${index+1}. ${formatted?'Expires '+formatted:'Expiry unavailable'}`);
  }
  if(!credits?.credits.length||(count!==undefined&&count!==null&&count>credits.credits.length))rows.push(zh?'部分有效期暂时无法读取。':'Some expiry details are unavailable.');
 }
 rows.push(zh?'时间：布里斯班（UTC+10）':'Times: Brisbane (UTC+10)');
 return rows.join('\n');
}
