'use strict';
// Build a small readable Markdown subset with DOM nodes; raw HTML never executes.
window.sidecarMarkdown=(text)=>{
 const doc=document,fragment=doc.createDocumentFragment();
 function inline(parent,value){
  const pattern=/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;let end=0;
  for(const match of value.matchAll(pattern)){
   parent.append(doc.createTextNode(value.slice(end,match.index)));const part=match[0];let node;
   if(part.startsWith('`')){node=doc.createElement('code');node.textContent=part.slice(1,-1);}
   else if(part.startsWith('**')){node=doc.createElement('strong');node.textContent=part.slice(2,-2);}
   else {const split=part.indexOf('](');node=doc.createElement('a');node.textContent=part.slice(1,split);node.href=part.slice(split+2,-1);node.target='_blank';node.rel='noopener noreferrer';}
   parent.append(node);end=match.index+part.length;
  }
  parent.append(doc.createTextNode(value.slice(end)));
 }
 const lines=String(text).split('\n');let i=0;
 while(i<lines.length){
  const line=lines[i];if(!line.trim()){i++;continue;}
  if(/^\s*```/.test(line)){const pre=doc.createElement('pre'),code=doc.createElement('code'),rows=[];i++;while(i<lines.length&&!/^\s*```/.test(lines[i]))rows.push(lines[i++]);i++;code.textContent=rows.join('\n');pre.append(code);fragment.append(pre);continue;}
  if(i+1<lines.length&&line.includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1])){
   const wrap=doc.createElement('div');wrap.className='table-scroll';const table=doc.createElement('table');const row=(line,tag)=>{const tr=doc.createElement('tr');for(const cell of line.trim().replace(/^\||\|$/g,'').split('|')){const td=doc.createElement(tag);inline(td,cell.trim());tr.append(td);}return tr;};table.append(row(line,'th'));i+=2;while(i<lines.length&&lines[i].includes('|'))table.append(row(lines[i++],'td'));wrap.append(table);fragment.append(wrap);continue;
  }
  const heading=line.match(/^(#{1,6})\s+(.+)$/);if(heading){const h=doc.createElement('h'+Math.min(heading[1].length+1,6));inline(h,heading[2]);fragment.append(h);i++;continue;}
  if(/^\s*(?:[-*+] |\d+[.)] )/.test(line)){const ordered=/^\s*\d/.test(line),list=doc.createElement(ordered?'ol':'ul');while(i<lines.length&&/^\s*(?:[-*+] |\d+[.)] )/.test(lines[i])){const li=doc.createElement('li');inline(li,lines[i++].replace(/^\s*(?:[-*+] |\d+[.)] )/,''));list.append(li);}fragment.append(list);continue;}
  if(/^>\s?/.test(line)){const quote=doc.createElement('blockquote');inline(quote,line.replace(/^>\s?/,''));fragment.append(quote);i++;continue;}
  const p=doc.createElement('p');inline(p,line);fragment.append(p);i++;
 }
 return fragment;
};
