"use client";
import { useCallback,useEffect,useRef,useState,type FormEvent } from 'react';
import { ArrowLeft,Heart,Link2,LoaderCircle,MessageCircle,Search } from 'lucide-react';
import FoodImage from './food-image';
import { communityRequest } from '@/lib/community-client';
import type { PublicRecipe,PublicComment } from '@/lib/community';
import { amount,type Recipe } from '@/lib/domain';
type Props={onManage:(id:string)=>void;isSignedIn:boolean;requireUser:()=>boolean;onSave:(recipe:Recipe)=>void;recipeId?:string;onSelect:(id:string)=>void};
type Feed={recipes:PublicRecipe[];nextCursor:string|null;viewerName:string};
type Detail={recipe:PublicRecipe;comments:PublicComment[];nextCommentCursor:string|null;viewerName:string};
function Like({recipe,working,onClick}:{recipe:PublicRecipe;working:boolean;onClick:()=>void}) {
 return <button className="community-like" disabled={working} aria-pressed={recipe.likedByViewer} aria-label={`${recipe.likedByViewer?'Unlike':'Like'} ${recipe.title}`} onClick={onClick}><Heart size={16} fill={recipe.likedByViewer?'currentColor':'none'}/><span>{recipe.likeCount} {recipe.likeCount===1?'like':'likes'}</span></button>;
}
export default function Community({onManage,isSignedIn,requireUser,onSave,recipeId='',onSelect}:Props) {
 const [query,setQuery]=useState('');
 return recipeId?<CommunityDetail key={recipeId} id={recipeId} onManage={onManage} isSignedIn={isSignedIn} requireUser={requireUser} onSave={onSave} onBack={()=>onSelect('')}/>:<CommunityFeed query={query} setQuery={setQuery} requireUser={requireUser} onOpen={onSelect}/>;
}
function CommunityFeed({query,setQuery,requireUser,onOpen}:{query:string;setQuery:(value:string)=>void;requireUser:()=>boolean;onOpen:(id:string)=>void}) {
 const [search,setSearch]=useState(query),[data,setData]=useState<Feed|null>(null),[loading,setLoading]=useState(true),[working,setWorking]=useState(''),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const sequence=useRef(0);
 useEffect(()=>{
  const current=++sequence.current;setLoading(true);setError('');
  void communityRequest<Feed>('?q='+encodeURIComponent(query)).then(result=>{if(current===sequence.current)setData(result);}).catch(error=>{if(current===sequence.current)setError(error.message);}).finally(()=>{if(current===sequence.current)setLoading(false);});
  return()=>{sequence.current++;};
 },[query,refresh]);
 async function more() {
  if(!data?.nextCursor)return;setWorking('more');setError('');const current=sequence.current;
  try {const result=await communityRequest<Feed>('?q='+encodeURIComponent(query)+'&cursor='+encodeURIComponent(data.nextCursor));if(current===sequence.current)setData(old=>old?{...result,recipes:[...old.recipes,...result.recipes.filter(recipe=>!old.recipes.some(existing=>existing.id===recipe.id))]}:result);}catch(error){setError((error as Error).message);}finally{setWorking('');}
 }
 async function like(recipe:PublicRecipe) {
  if(!requireUser())return;setWorking(recipe.id);setError('');
  try {await communityRequest({action:'like',recipeId:recipe.id,liked:!recipe.likedByViewer});setData(old=>old?{...old,recipes:old.recipes.map(row=>row.id===recipe.id?{...row,likedByViewer:!recipe.likedByViewer,likeCount:Math.max(0,row.likeCount+(recipe.likedByViewer?-1:1))}:row)}:old);}catch(error){setError((error as Error).message);}finally{setWorking('');}
 }
 return <div className="community">
  <p className="community-intro">Recipes shared by other cooks, with room to exchange a few notes about what worked at the table.</p>
  <form className="community-search" onSubmit={event=>{event.preventDefault();setQuery(search.trim());}}><label className="search"><Search size={16}/><input aria-label="Search public recipes" maxLength={80} placeholder="Find a shared recipe" value={search} onChange={event=>setSearch(event.target.value)}/></label><button className="outline" disabled={loading||!!working}>Search</button><button type="button" className="text-button" disabled={loading||!!working} onClick={()=>setRefresh(value=>value+1)}>Refresh</button></form>
  {error&&<div className="error-banner" role="alert">{error}<button className="inline-link" onClick={()=>setRefresh(value=>value+1)}>Try again</button></div>}
  {loading?<div className="empty" role="status"><LoaderCircle className="spin"/><p>Opening the community recipe book…</p></div>:data?.recipes.length?<>
   <div className="recipe-grid">{data.recipes.map(recipe=><article className="recipe-card" key={recipe.id}>
    <div className="card-photo"><button className="photo-button" aria-label={`Open shared recipe ${recipe.title}`} onClick={()=>onOpen(recipe.id)}><FoodImage src={recipe.imageUrl} alt={recipe.title}/></button></div>
    <div className="card-body"><p className="community-byline">Shared by {recipe.authorName}{recipe.ownedByViewer?' · Your recipe':''}</p><button className="card-title" onClick={()=>onOpen(recipe.id)}>{recipe.title}</button><p>{recipe.description}</p>
     <div className="community-card-meta"><span>{recipe.minutes>0?`${recipe.minutes} min`:'Time not listed'}</span><span>{recipe.servings} servings</span></div>
     <div className="community-card-actions"><Like recipe={recipe} working={!!working} onClick={()=>like(recipe)}/><button className="text-button" onClick={()=>onOpen(recipe.id)}><MessageCircle size={16}/>{recipe.commentCount} {recipe.commentCount===1?'comment':'comments'}</button></div>
    </div></article>)}</div>
   {data.nextCursor&&<button className="outline community-more" disabled={!!working} onClick={more}>Load more recipes</button>}
  </>:<div className="empty"><h2>{query?'No shared recipes match your search':'The community recipe book is open'}</h2><p>{query?'Try another recipe name.':'To share something from your kitchen, open a saved recipe and choose Share publicly. Your recipes stay private until you publish them.'}</p></div>}
 </div>;
}
function CommunityDetail({id,onManage,isSignedIn,requireUser,onSave,onBack}:{id:string;onManage:(id:string)=>void;isSignedIn:boolean;requireUser:()=>boolean;onSave:(recipe:Recipe)=>void;onBack:()=>void}) {
 const [data,setData]=useState<Detail|null>(null),[loading,setLoading]=useState(true),[working,setWorking]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [displayName,setDisplayName]=useState(''),[body,setBody]=useState(''),[editing,setEditing]=useState(''),[editBody,setEditBody]=useState(''),[confirmDelete,setConfirmDelete]=useState('');
 const load=useCallback(async()=>{const result=await communityRequest<Detail>('?id='+encodeURIComponent(id));setData(result);setDisplayName(result.viewerName);return result;},[id]);
 useEffect(()=>{let active=true;setLoading(true);void communityRequest<Detail>('?id='+encodeURIComponent(id)).then(result=>{if(active){setData(result);setDisplayName(result.viewerName);}}).catch(error=>{if(active)setError(error.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[id]);
 async function like() {
  if(!data||!requireUser())return;setWorking('like');setError('');
  try {await communityRequest({action:'like',recipeId:id,liked:!data.recipe.likedByViewer});setData(old=>old?{...old,recipe:{...old.recipe,likedByViewer:!old.recipe.likedByViewer,likeCount:Math.max(0,old.recipe.likeCount+(old.recipe.likedByViewer?-1:1))}}:old);}catch(error){setError((error as Error).message);}finally{setWorking('');}
 }
 async function comment(event:FormEvent) {
  event.preventDefault();if(!requireUser())return;setWorking('comment');setError('');
  try {await communityRequest({action:'comment',recipeId:id,displayName,body});setBody('');await load();setNotice('Your comment has been added.');}catch(error){setError((error as Error).message);}finally{setWorking('');}
 }
 async function changeComment(commentId:string,remove=false) {
  setWorking(commentId);setError('');
  try {await communityRequest(remove?{action:'deleteComment',commentId}:{action:'editComment',commentId,body:editBody});setEditing('');setConfirmDelete('');await load();setNotice(remove?'Comment removed.':'Comment updated.');}catch(error){setError((error as Error).message);}finally{setWorking('');}
 }
 async function moreComments() {
  if(!data?.nextCommentCursor)return;setWorking('more');setError('');
  try {const result=await communityRequest<Detail>('?id='+encodeURIComponent(id)+'&commentsBefore='+encodeURIComponent(data.nextCommentCursor));setData(old=>old?{...old,nextCommentCursor:result.nextCommentCursor,comments:[...old.comments,...result.comments.filter(comment=>!old.comments.some(existing=>existing.id===comment.id))]}:old);}catch(error){setError((error as Error).message);}finally{setWorking('');}
 }
 function save() {
  if(!data||!requireUser())return;const recipe=data.recipe;
  onSave({id:'',title:recipe.title,description:recipe.description,imageUrl:recipe.imageUrl,sourceUrl:recipe.sourceUrl||window.location.origin+'/?shared='+recipe.id,sourceName:recipe.sourceName||recipe.authorName,servings:recipe.servings,minutes:recipe.minutes,cuisine:recipe.cuisine,ingredients:recipe.ingredients||[],instructions:recipe.instructions||[],notes:'',collection:'Everyday',collections:['Everyday'],favorite:false,isPublic:false,externalProvider:recipe.externalProvider==='themealdb'?'themealdb':null,externalId:recipe.externalId});
 }
 return <div className="community"><button className="text-button community-back" onClick={onBack}><ArrowLeft size={16}/>Back to community</button>
  {error&&<div className="error-banner" role="alert">{error}<button className="inline-link" onClick={()=>{setError('');void load().catch(error=>setError(error.message));}}>Try again</button></div>}
  {notice&&<p role="status" className="discovery-status">{notice}</p>}
  {loading?<div className="empty" role="status"><LoaderCircle className="spin"/><p>Opening this recipe…</p></div>:data&&<>
   <article className="community-recipe">
    <div className="community-cover"><FoodImage src={data.recipe.imageUrl} alt={data.recipe.title}/></div>
    <p className="community-byline">Shared by {data.recipe.authorName}</p><h2>{data.recipe.title}</h2><p>{data.recipe.description}</p>
    <div className="community-card-meta"><span>{data.recipe.minutes>0?`${data.recipe.minutes} minutes`:'Time not listed'}</span><span>{data.recipe.servings} servings</span>{data.recipe.cuisine&&<span>{data.recipe.cuisine}</span>}</div>
    <div className="community-recipe-actions"><Like recipe={data.recipe} working={!!working} onClick={like}/>{data.recipe.ownedByViewer?<button className="outline" onClick={()=>onManage(id)}>Manage your recipe</button>:<button className="outline" onClick={save}>Save a private copy</button>}<button className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(window.location.origin+'/?shared='+id);setNotice('Public recipe link copied.');}catch{setError('Clipboard access was unavailable.');}}}><Link2 size={16}/>Copy recipe link</button></div>
    <div className="community-method"><section><h3>Ingredients</h3><ul>{data.recipe.ingredients?.map((line,index)=><li key={index}><span>{amount(line.quantity,line.unit)}</span><div>{line.name}{line.preparation&&<small>{line.preparation}</small>}</div></li>)}</ul></section><section><h3>Method</h3><ol>{data.recipe.instructions?.map((step,index)=><li key={index}>{step}</li>)}</ol></section></div>
    <div className="community-sources">{data.recipe.sourceUrl&&<a href={data.recipe.sourceUrl} target="_blank" rel="noreferrer">Original recipe · {data.recipe.sourceName||new URL(data.recipe.sourceUrl).hostname}</a>}{data.recipe.externalProvider==='themealdb'&&<a href={'https://www.themealdb.com/meal.php?c='+data.recipe.externalId} target="_blank" rel="noreferrer">Recipe data from TheMealDB</a>}{data.recipe.imageUrl&&<a href={data.recipe.imageUrl} target="_blank" rel="noreferrer">Photo source</a>}</div>
   </article>
   <section className="community-comments"><h2>At the table <span>{data.recipe.commentCount}</span></h2><p>Share a substitution, a cooking note, or a question for the cook.</p>
    {isSignedIn?<form className="community-comment-form" onSubmit={comment}><label>Your public display name<input required minLength={2} maxLength={60} value={displayName} onChange={event=>setDisplayName(event.target.value)}/></label><label>Your comment<textarea required maxLength={2000} rows={3} value={body} onChange={event=>setBody(event.target.value)}/></label><p className="community-form-note">Comments and your chosen display name are public.</p><button className="primary" disabled={!!working}>{working==='comment'&&<LoaderCircle size={15} className="spin"/>}Post comment</button></form>:<div className="discovery-notice">Sign in to join the conversation. <button className="inline-link" onClick={requireUser}>Sign in to comment</button></div>}
    {!data.comments.length&&<p className="community-no-comments">No comments yet. There’s room for the first cooking note.</p>}
    <div>{data.comments.map(comment=><article className="community-comment" key={comment.id}><div className="comment-heading"><strong>{comment.authorName}</strong><time dateTime={new Date(comment.createdAt).toISOString()}>{new Date(comment.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}{comment.updatedAt!==comment.createdAt?' · Edited':''}</time></div>
     {editing===comment.id?<form onSubmit={event=>{event.preventDefault();void changeComment(comment.id);}}><label>Edit your comment<textarea required maxLength={2000} value={editBody} onChange={event=>setEditBody(event.target.value)}/></label><div className="action-group"><button className="outline" disabled={!!working}>Save comment</button><button className="text-button" type="button" disabled={!!working} onClick={()=>setEditing('')}>Cancel</button></div></form>:<p className="comment-body">{comment.body}</p>}
     <div className="comment-actions">{comment.canEdit&&editing!==comment.id&&<button className="text-button" disabled={!!working} onClick={()=>{setEditing(comment.id);setEditBody(comment.body);}}>Edit comment</button>}{comment.canDelete&&<button className="text-button danger" disabled={!!working} onClick={()=>setConfirmDelete(comment.id)}>Remove comment</button>}</div>
     {confirmDelete===comment.id&&<div className="comment-remove-confirm"><p>Remove this comment from the conversation?</p><button className="text-button danger" disabled={!!working} onClick={()=>changeComment(comment.id,true)}>Confirm removal</button><button className="text-button" disabled={!!working} onClick={()=>setConfirmDelete('')}>Keep comment</button></div>}
    </article>)}</div>
    {data.nextCommentCursor&&<button className="outline community-more" disabled={!!working} onClick={moreComments}>Load earlier comments</button>}
   </section>
  </>}
 </div>;
}
