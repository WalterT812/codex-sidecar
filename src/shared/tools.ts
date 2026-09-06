export const desktopTools={
 timer:{title:'学习计时',icon:'clock'},learning:{title:'学习桌',icon:'book'},focus:{title:'专注模式',icon:'focus'},
 outline:{title:'对话目录',icon:'list'},search:{title:'找回原文',icon:'search'},resume:{title:'接着聊',icon:'resume'},
 snippets:{title:'常用片段',icon:'layers'},decisions:{title:'当前决定',icon:'check'},ideas:{title:'随手记',icon:'note'},resources:{title:'软件与成果',icon:'folder'},inbox:{title:'工作收件箱',icon:'inbox'},
 appearance:{title:'外观',icon:'settings'},voice:{title:'语音输入',icon:'mic'},
} as const;
export type ShortcutTool=keyof typeof desktopTools;
export const toolGroups:{title:string;tools:ShortcutTool[]}[]=[
 {title:'学习与专注',tools:['timer','learning','focus']},
 {title:'对话与回顾',tools:['outline','search','resume']},
 {title:'记录与资料',tools:['snippets','decisions','ideas','resources','inbox']},
 {title:'外观与输入',tools:['appearance','voice']},
];
export function validateShortcuts(value:unknown):ShortcutTool[]{
 if(!Array.isArray(value)||value.length>Object.keys(desktopTools).length||value.some(k=>typeof k!=='string'||!Object.hasOwn(desktopTools,k))||new Set(value).size!==value.length)throw Error('Invalid shortcut selection');
 return [...value] as ShortcutTool[];
}
