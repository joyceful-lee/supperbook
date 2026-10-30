export type ThreadParticipant={id:string;displayName:string};
export type Mention=ThreadParticipant;
export function mentionsInBody(body:string,selected:Mention[]):Mention[] {
 return selected.filter(person=>{
  const token='@'+person.displayName;
  let index=body.indexOf(token);
  while(index!==-1){const before=body[index-1],after=body[index+token.length];if((!before||!/[\p{L}\p{N}_@]/u.test(before))&&(!after||!/[\p{L}\p{N}_]/u.test(after)))return true;index=body.indexOf(token,index+1);}
  return false;
 }).filter((person,index,all)=>all.findIndex(other=>other.id===person.id)===index);
}
export function mentionSegments(body:string,mentions:Mention[]):{text:string;mention:boolean}[] {
 const result:{text:string;mention:boolean}[]=[];
 const tokens=[...new Set(mentions.map(person=>'@'+person.displayName))].sort((a,b)=>b.length-a.length);
 let start=0,index=0;
 while(index<body.length){const token=tokens.find(token=>body.startsWith(token,index)&&(!body[index-1]||!/[\p{L}\p{N}_@]/u.test(body[index-1]))&&(!body[index+token.length]||!/[\p{L}\p{N}_]/u.test(body[index+token.length])));if(token){if(index>start)result.push({text:body.slice(start,index),mention:false});result.push({text:token,mention:true});index+=token.length;start=index;}else index++;}
 if(start<body.length)result.push({text:body.slice(start),mention:false});return result;
}
export type NotificationPreferences={enabled:boolean;likes:boolean;comments:boolean;mentions:boolean};
export const defaultNotificationPreferences:NotificationPreferences={enabled:true,likes:true,comments:true,mentions:true};
