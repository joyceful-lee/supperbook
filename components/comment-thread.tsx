"use client";
import { useCallback,useEffect,useState,type FormEvent } from 'react';
import { LoaderCircle,MessageCircle } from 'lucide-react';
import { communityRequest } from '@/lib/community-client';
import type { PublicComment } from '@/lib/community';
import { mentionSegments,mentionsInBody,type Mention,type ThreadParticipant } from '@/lib/threads';
type Request=<T=unknown>(input:string|Record<string,unknown>)=>Promise<T>;
type Thread={root:PublicComment;replies:PublicComment[];nextReplyCursor:string|null;participants:ThreadParticipant[]};
export function CommentComposer({recipeId,threadId,displayName='',comment,initialMention,onDone,onCancel,request=communityRequest}:{request?:Request;recipeId:string;threadId?:string;displayName?:string;comment?:PublicComment;initialMention?:Mention|null;onDone:()=>Promise<unknown>;onCancel?:()=>void}) {
 const [name,setName]=useState(displayName),[body,setBody]=useState(comment?.body||''),[selected,setSelected]=useState<Mention[]>(comment?.mentions||[]);
 const [search,setSearch]=useState(''),[people,setPeople]=useState<ThreadParticipant[]>([]),[loading,setLoading]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState(''),[peopleError,setPeopleError]=useState('');
 useEffect(()=>{if(!initialMention)return;setSelected(old=>old.some(person=>person.id===initialMention.id)?old:[...old,initialMention]);setBody(old=>mentionsInBody(old,[initialMention]).length?old:old+(old&&!/\s$/.test(old)?' ':'')+'@'+initialMention.displayName+' ');},[initialMention?.id,initialMention?.displayName]);
 useEffect(()=>{
  if(!threadId)return;let active=true;setLoading(true);setPeopleError('');
  const timer=setTimeout(()=>{void request<{participants:ThreadParticipant[]}>('?id='+encodeURIComponent(recipeId)+'&thread='+encodeURIComponent(threadId)+'&participants=1&q='+encodeURIComponent(search)).then(data=>{if(active)setPeople(data.participants);}).catch(()=>{if(active)setPeopleError('Names could not be loaded. Try searching again.');}).finally(()=>{if(active)setLoading(false);});},250);
  return()=>{active=false;clearTimeout(timer);};
 },[recipeId,threadId,search,request]);
 async function submit(event:FormEvent) {
  event.preventDefault();setWorking(true);setError('');
  try {await request(comment?{action:'editComment',commentId:comment.id,body,mentions:mentionsInBody(body,selected).map(person=>person.id)}:{action:'comment',recipeId,displayName:name,body,parentId:threadId||null,mentions:mentionsInBody(body,selected).map(person=>person.id)});await onDone();if(!comment){setBody('');setSelected([]);}}
  catch(error){setError((error as Error).message);}finally{setWorking(false);}
 }
 function mention(person:ThreadParticipant){setSelected(old=>old.some(existing=>existing.id===person.id)?old:[...old,person]);setBody(old=>mentionsInBody(old,[person]).length?old:old+(old&&!/\s$/.test(old)?' ':'')+'@'+person.displayName+' ');}
 return <form className="community-comment-form" onSubmit={submit}>
  {!comment&&<label>Your public display name<input required minLength={2} maxLength={60} value={name} disabled={working} onChange={event=>setName(event.target.value)}/></label>}
  <label>{comment?'Edit your comment':threadId?'Your reply':'Your comment'}<textarea required rows={3} maxLength={2000} disabled={working} value={body} onChange={event=>setBody(event.target.value)}/></label>
  {threadId&&<details className="mention-picker"><summary>Mention someone in this thread</summary><label>Find a participant<input maxLength={60} value={search} disabled={working} onChange={event=>setSearch(event.target.value)}/></label>
   {loading?<p role="status">Finding names…</p>:peopleError?<p role="alert">{peopleError}</p>:<div className="mention-options">{people.filter(person=>!selected.some(existing=>existing.id===person.id)).map(person=><button type="button" disabled={working||selected.length>=10} key={person.id} onClick={()=>mention(person)}>@{person.displayName}</button>)}{!people.length&&<p>{search?'No participants match this name.':'No other cooks have joined this thread yet.'}</p>}</div>}
   <small>Choose a name to send a mention notification. Only people who have commented in this thread appear here.</small>
  </details>}
  {!!selected.length&&<div className="selected-mentions" aria-label="Selected mentions">{selected.map(person=><button type="button" key={person.id} disabled={working} aria-label={'Remove mention of '+person.displayName} onClick={()=>setSelected(old=>old.filter(existing=>existing.id!==person.id))}>@{person.displayName} ×</button>)}</div>}
  <p className="community-form-note">{threadId?'Replies stay beneath the original comment. ':''}Comments and your chosen display name are public.</p>
  {error&&<p className="form-error" role="alert">{error}</p>}
  <div className="action-group"><button className="primary" disabled={working}>{working&&<LoaderCircle size={15} className="spin"/>}{comment?'Save comment':threadId?'Post reply':'Post comment'}</button>{onCancel&&<button className="text-button" type="button" disabled={working} onClick={onCancel}>Cancel</button>}</div>
 </form>;
}
function CommentRow({comment,recipeId,rootId,isSignedIn,requireUser,displayName,onReply,onChanged,request}:{request:Request;comment:PublicComment;recipeId:string;rootId:string;isSignedIn:boolean;requireUser:()=>boolean;displayName:string;onReply:(comment:PublicComment)=>void;onChanged:()=>Promise<unknown>}) {
 const [editing,setEditing]=useState(false),[removing,setRemoving]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState('');
 async function change(restore=false){setWorking(true);setError('');try{await request({action:restore?'restoreComment':'deleteComment',commentId:comment.id});setRemoving(false);await onChanged();}catch(error){setError((error as Error).message);}finally{setWorking(false);}}
 return <div className="comment-entry"><div className="comment-heading"><strong>{comment.authorName}</strong><time dateTime={new Date(comment.createdAt).toISOString()}>{new Date(comment.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}{comment.updatedAt!==comment.createdAt&&!comment.deleted?' · Edited':''}</time></div>
  {editing?<CommentComposer request={request} recipeId={recipeId} threadId={rootId} displayName={displayName} comment={comment} onDone={async()=>{setEditing(false);await onChanged();}} onCancel={()=>setEditing(false)}/>:comment.deleted?<p className="comment-removed">This comment was removed. Replies remain in the thread.</p>:<p className="comment-body">{mentionSegments(comment.body,comment.mentions).map((part,index)=>part.mention?<mark className="comment-mention" key={index}>{part.text}</mark>:part.text)}</p>}
  <div className="comment-actions"><button className="text-button" disabled={working} onClick={()=>{if(isSignedIn||requireUser())onReply(comment);}}>Reply</button>{comment.canEdit&&!editing&&<button className="text-button" disabled={working} onClick={()=>setEditing(true)}>Edit comment</button>}{comment.canDelete&&<button className="text-button danger" disabled={working} onClick={()=>setRemoving(true)}>Remove comment</button>}{comment.canRestore&&<button className="text-button" disabled={working} onClick={()=>change(true)}>Restore comment</button>}</div>
  {removing&&<div className="comment-remove-confirm"><p>Remove this comment from the conversation? Replies stay in this thread. A comment you remove can be restored.</p><button className="text-button danger" disabled={working} onClick={()=>change()}>Confirm removal</button><button className="text-button" disabled={working} onClick={()=>setRemoving(false)}>Keep comment</button></div>}
  {error&&<p className="form-error" role="alert">{error}</p>}
 </div>;
}
export default function CommentThread({root,recipeId,displayName,isSignedIn,requireUser,onChanged,initiallyOpen=false,request=communityRequest}:{request?:Request;root:PublicComment;recipeId:string;displayName:string;isSignedIn:boolean;requireUser:()=>boolean;onChanged:()=>Promise<unknown>;initiallyOpen?:boolean}) {
 const [open,setOpen]=useState(initiallyOpen),[data,setData]=useState<Thread|null>(null),[replyTo,setReplyTo]=useState<PublicComment|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{const result=await request<Thread>('?id='+encodeURIComponent(recipeId)+'&thread='+encodeURIComponent(root.id));setData(result);return result;},[recipeId,root.id,request]);
 useEffect(()=>{if(!open)return;let active=true;setLoading(true);void request<Thread>('?id='+encodeURIComponent(recipeId)+'&thread='+encodeURIComponent(root.id)).then(result=>{if(active)setData(result);}).catch(error=>{if(active)setError(error.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[open,recipeId,root.id,request]);
 async function changed(){await load();await onChanged();}
 async function earlier(){if(!data?.nextReplyCursor)return;setLoading(true);setError('');try{const result=await request<Thread>('?id='+encodeURIComponent(recipeId)+'&thread='+encodeURIComponent(root.id)+'&repliesBefore='+encodeURIComponent(data.nextReplyCursor));setData(old=>old?{...result,replies:[...old.replies,...result.replies.filter(reply=>!old.replies.some(existing=>existing.id===reply.id))]}:result);}catch(error){setError((error as Error).message);}finally{setLoading(false);}}
 function reply(comment:PublicComment){setOpen(true);setReplyTo(comment);}
 return <article className="community-comment comment-thread" tabIndex={-1} id={'thread-'+root.id}>
  <CommentRow comment={data?.root||root} request={request} rootId={root.id} recipeId={recipeId} displayName={displayName} isSignedIn={isSignedIn} requireUser={requireUser} onReply={reply} onChanged={changed}/>
  {(root.replyCount>0||open)&&<button className="thread-toggle text-button" aria-expanded={open} onClick={()=>setOpen(!open)}><MessageCircle size={14}/>{open?'Hide replies':`View ${root.replyCount} ${root.replyCount===1?'reply':'replies'}`}</button>}
  {open&&<div className="thread-replies">
   {error&&<p className="form-error" role="alert">{error}</p>}{loading&&!data&&<p role="status">Opening this thread…</p>}
   {data?.nextReplyCursor&&<button className="text-button" disabled={loading} onClick={earlier}>Load earlier replies</button>}
   {data?.replies.slice().reverse().map(comment=><div className="thread-reply" key={comment.id}><CommentRow comment={comment} request={request} rootId={root.id} recipeId={recipeId} displayName={displayName} isSignedIn={isSignedIn} requireUser={requireUser} onReply={reply} onChanged={changed}/></div>)}
   {replyTo&&isSignedIn&&<div className="thread-reply-composer"><p>Replying in this thread</p><CommentComposer request={request} recipeId={recipeId} threadId={root.id} displayName={displayName} initialMention={replyTo.authorId&&!replyTo.canEdit?{id:replyTo.authorId,displayName:replyTo.authorName}:null} onDone={async()=>{await changed();setReplyTo(null);}} onCancel={()=>setReplyTo(null)}/></div>}
  </div>}
 </article>;
}
