"use client";
import { useEffect,useState,type FormEvent } from 'react';
import { Globe,Lock,LoaderCircle } from 'lucide-react';
import { communityRequest } from '@/lib/community-client';
import type { Recipe } from '@/lib/domain';
export default function RecipeVisibility({recipe,onChange,onCommunity}:{recipe:Recipe;onChange:(isPublic:boolean)=>void;onCommunity:()=>void}) {
 const [open,setOpen]=useState(false),[displayName,setDisplayName]=useState(''),[working,setWorking]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;void communityRequest<{displayName:string}>('?profile=1').then(data=>{if(active)setDisplayName(data.displayName);}).catch(()=>{});return()=>{active=false;};},[]);
 async function change(event:FormEvent) {
  event.preventDefault();setWorking(true);setError('');
  try {await communityRequest({action:recipe.isPublic?'unpublish':'publish',recipeId:recipe.id,...(!recipe.isPublic?{displayName}: {})});onChange(!recipe.isPublic);setOpen(false);}
  catch(error){setError((error as Error).message);}finally{setWorking(false);}
 }
 return <section className="recipe-visibility" aria-label="Recipe visibility">
  <div className="visibility-heading"><span>{recipe.isPublic?<Globe size={16}/>:<Lock size={16}/>} {recipe.isPublic?'Public recipe':'Private recipe'}</span>
   <button className="text-button" disabled={working} onClick={()=>{setOpen(!open);setError('');}}>{recipe.isPublic?'Make private':'Share publicly'}</button></div>
  {recipe.isPublic&&<p>Shared in the community. <button className="inline-link" onClick={onCommunity}>View recipe and comments</button></p>}
  {open&&<form onSubmit={change}>
   {recipe.isPublic?<p>Making this recipe private removes it from the community and hides its comments and likes. They return if you share it again. Copies already saved by other cooks remain in their kitchens.</p>:<>
    <p>Your recipe, photo, ingredients, method and source links will be visible to everyone. Your cooking notes and collections stay private. Other cooks can save their own copies. Saved edits to a public recipe are also public.</p>
    <label>Your public display name<input required minLength={2} maxLength={60} value={displayName} onChange={event=>setDisplayName(event.target.value)}/></label>
    <small>This name appears with your shared recipes and comments.</small>
   </>}
   <div className="action-group"><button className="primary" disabled={working}>{working&&<LoaderCircle size={15} className="spin"/>}{recipe.isPublic?'Make recipe private':'Publish recipe'}</button><button type="button" className="text-button" disabled={working} onClick={()=>setOpen(false)}>Cancel</button></div>
  </form>}
  {error&&<p className="form-error" role="alert">{error}</p>}
 </section>;
}
