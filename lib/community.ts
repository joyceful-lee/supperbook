import type { Mention } from './threads.ts';
export type PublicIngredient = {name:string;quantity:number|null;unit:string;preparation:string};
export type PublicRecipe = {
 id:string;title:string;description:string;imageUrl:string;sourceUrl:string;sourceName:string;
 servings:number;minutes:number;cuisine:string;publishedAt:string;authorName:string;
 likeCount:number;commentCount:number;likedByViewer:boolean;ownedByViewer:boolean;
 externalId:string|null;externalProvider:string|null;
 ingredients?:PublicIngredient[];instructions?:string[];
};
export type PublicComment = {id:string;body:string;authorName:string;authorId:string|null;parentId:string|null;deleted:boolean;replyCount:number;mentions:Mention[];createdAt:string;updatedAt:string;canEdit:boolean;canDelete:boolean;canRestore:boolean};
function safeUrl(value:unknown) {
 try {const url=new URL(String(value||""));return ["http:","https:"].includes(url.protocol)&&!url.username&&!url.password?url.href:"";}catch{return "";}
}
// Explicit public projection: never spread an owned kitchen record into a public response.
export function publicRecipe(row:Record<string,unknown>,detail=false):PublicRecipe {
 const result:PublicRecipe={
  id:String(row.id),title:String(row.title||""),description:String(row.description||""),
  imageUrl:safeUrl(row.imageUrl),sourceUrl:safeUrl(row.sourceUrl),sourceName:String(row.sourceName||""),
  servings:Number(row.servings),minutes:Number(row.minutes),cuisine:String(row.cuisine||""),
  publishedAt:String(row.publishedAt),authorName:String(row.authorName||"Community cook"),
  likeCount:Number(row.likeCount||0),commentCount:Number(row.commentCount||0),
  likedByViewer:row.likedByViewer===true,ownedByViewer:row.ownedByViewer===true,
  externalId:row.externalId?String(row.externalId):null,externalProvider:row.externalProvider?String(row.externalProvider):null,
 };
 if(detail) {
  result.ingredients=Array.isArray(row.ingredients)?row.ingredients.map(line=>({name:String(line.name||""),quantity:line.quantity==null?null:Number(line.quantity),unit:String(line.unit||""),preparation:String(line.preparation||"")})):[];
  result.instructions=Array.isArray(row.instructions)?row.instructions.filter((step):step is string=>typeof step==="string"):[];
 }
 return result;
}
export function publicComment(row:Record<string,unknown>):PublicComment {
 return {id:String(row.id),body:row.deleted?"":String(row.body),authorName:row.deleted?"Comment removed":String(row.authorName||"Community cook"),authorId:row.deleted?null:row.authorId?String(row.authorId):null,parentId:row.parentId?String(row.parentId):null,deleted:row.deleted===true,replyCount:Number(row.replyCount||0),mentions:row.deleted?[]:Array.isArray(row.mentions)?row.mentions.map(person=>({id:String(person.id),displayName:String(person.displayName)})):[],createdAt:String(row.createdAt),updatedAt:String(row.updatedAt),canEdit:row.deleted!==true&&row.canEdit===true,canDelete:row.deleted!==true&&row.canDelete===true,canRestore:row.canRestore===true};
}
export function communityCursor(date:unknown,id:unknown) {const value=String(date);return (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,6}Z$/.test(value)?value:new Date(value).toISOString())+"|"+String(id);}
export function readCommunityCursor(value:string|null):[string|null,string|null] {
 if(!value)return [null,null];
 const [date,id,...extra]=value.split("|");
 if(extra.length||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,6}Z$/.test(date)||!Number.isFinite(Date.parse(date))||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(id)||!/^[0-9a-f-]+$/i.test(id))throw new Error("Invalid page cursor.");
 return [date,id];
}
