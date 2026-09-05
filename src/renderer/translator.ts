import {button,element} from './components.js';
import type {TranslationRecord} from '../shared/types.js';

/** One explicit Sol request; source and result survive switching tools. */
export function createTranslator(win:Window,cloud:(text:string,source:string,target:string)=>Promise<string>,clearHistory?:()=>void){
 const doc=win.document,form=element(doc,'form','form translator');form.dataset.testid='translator';
 const heading=element(doc,'h2','settings-heading'),description=element(doc,'p','settings-intro');
 const engine=element(doc,'p','translation-engine','Sol · medium');engine.dataset.testid='translate-engine';
 const languages=element(doc,'div','translation-languages'),source=element(doc,'select'),target=element(doc,'select');
 source.dataset.testid='translate-source';target.dataset.testid='translate-target';
 for(const select of [source,target])for(const [value,label] of [['en','English'],['zh','简体中文'],['ja','日本語'],['ko','한국어'],['fr','Français'],['de','Deutsch']]){
  const option=element(doc,'option','',label);option.value=value!;select.append(option);
 }
 source.value='en';target.value='zh';
 const swap=button(doc,'交换语言','translate-swap','refresh','icon-button');swap.onclick=()=>{const previous=source.value;source.value=target.value;target.value=previous;};languages.append(source,swap,target);
 const inputLabel=element(doc,'label','field'),inputCaption=element(doc,'span'),input=element(doc,'textarea','translation-input');input.dataset.testid='translate-input';input.maxLength=12000;inputLabel.append(inputCaption,input);
 const outputLabel=element(doc,'label','field'),outputCaption=element(doc,'span'),output=element(doc,'textarea','translation-output');output.readOnly=true;output.dataset.testid='translate-output';outputLabel.append(outputCaption,output);
 const progress=element(doc,'p','field-help');progress.setAttribute('role','status');progress.dataset.testid='translate-status';
 const submit=button(doc,'翻译','translate-submit','arrow','button primary');submit.type='submit';
 const copy=button(doc,'复制译文','translate-copy','note');copy.disabled=true;
 const actions=element(doc,'div','form-actions');actions.append(submit,copy);
 const history=element(doc,'section','translation-history');history.dataset.testid='translation-history';form.append(heading,engine,description,languages,inputLabel,progress,actions,outputLabel,history);
 let cn=true,pending=false,disposed=false,historyKey='';const text=(zh:string,en:string)=>cn?zh:en;
 function language(chinese:boolean){
  cn=chinese;heading.textContent=text('随手翻译','Translate');description.textContent=text('使用 Codex 额度，历史保存在本机，不新建聊天。','Uses Codex quota. History stays on this device; no new chat.');
  source.setAttribute('aria-label',text('源语言','Source language'));target.setAttribute('aria-label',text('目标语言','Target language'));inputCaption.textContent=text('原文','Source text');outputCaption.textContent=text('译文','Translation');input.placeholder=text('输入或粘贴要翻译的内容…','Type or paste text…');submit.querySelector('span')!.textContent=text('翻译','Translate');copy.querySelector('span')!.textContent=text('复制译文','Copy');
 }
 copy.onclick=async()=>{try{await win.navigator.clipboard.writeText(output.value);progress.textContent=text('译文已复制','Translation copied');}catch{output.focus();output.select();progress.textContent=text('已选中译文，按 Ctrl+C 复制','Selected; press Ctrl+C to copy');}};
 form.onsubmit=async event=>{
  event.preventDefault();if(pending||disposed)return;if(!input.value.trim()){input.focus();return;}
  const original=input.value,from=source.value,to=target.value;if(from===to){output.value=original;copy.disabled=false;progress.textContent='';return;}
  pending=true;submit.disabled=swap.disabled=source.disabled=target.disabled=true;progress.textContent=text('Sol 正在翻译…','Sol is translating…');
  try{const translated=await cloud(original,from,to);if(!disposed){output.value=translated;copy.disabled=false;progress.textContent=text('Sol 翻译完成','Translated by Sol');}}
  catch{if(!disposed)progress.textContent=text('Sol 翻译暂不可用，原文已保留。请检查额度或连接后重试。','Sol translation unavailable. Your text is kept; check quota or connection and retry.');}
  finally{pending=false;if(!disposed)submit.disabled=swap.disabled=source.disabled=target.disabled=false;}
 };
 function setHistory(records:TranslationRecord[]){
  const key=JSON.stringify([cn,...records.map(row=>row.id)]);if(key===historyKey)return;historyKey=key;history.replaceChildren();
  const header=element(doc,'div','content-top');header.append(element(doc,'h3','settings-heading',text('翻译历史','Translation history')));
  if(records.length&&clearHistory){const clear=button(doc,text('清空','Clear'),'translate-history-clear',undefined,'button text-button');let confirming=false;clear.onclick=()=>{if(pending)return;if(!confirming){confirming=true;clear.querySelector('span')!.textContent=text('确认清空','Confirm clear');return;}clearHistory();};header.append(clear);}
  history.append(header,element(doc,'p','field-help',text('本机保留最近 50 条译文。点一条即可回看。','Up to 50 recent translations on this device. Select one to reopen.')));
  if(!records.length){history.append(element(doc,'p','field-help',text('还没有翻译记录','No translations yet')));return;}
  for(const item of [...records].reverse()){
   const entry=button(doc,item.text.slice(0,80),'translate-history-item',undefined,'translation-history-item');entry.replaceChildren(element(doc,'span','history-title',item.text.slice(0,100)),element(doc,'span','history-meta',`${item.source.toUpperCase()} → ${item.target.toUpperCase()} · ${new Date(item.createdAt).toLocaleString(cn?'zh-CN':'en-AU')}`));
   entry.onclick=()=>{if(pending)return;input.value=item.text;output.value=item.translation;copy.disabled=false;source.value=item.source;target.value=item.target;progress.textContent=text('已打开本机历史记录','Opened local translation history');input.scrollIntoView?.({block:'nearest'});};history.append(entry);
  }
 }
 language(true);setHistory([]);return{element:form,language,setHistory,destroy(){disposed=true;form.remove();}};
}
