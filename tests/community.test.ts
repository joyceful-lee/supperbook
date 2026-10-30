import test from 'node:test';
import assert from 'node:assert/strict';
import { publicRecipe,publicComment,communityCursor,readCommunityCursor } from '../lib/community.ts';
test('public recipe projection excludes personal notes, collections, account identifiers and raw ingredient records',()=>{
 const result=publicRecipe({id:'recipe',title:'Soup',servings:2,minutes:20,notes:'Private diary',user_id:'private-user',email:'private@example.invalid',collections:['Private collection'],favorite:true,imageUrl:'javascript:alert(1)',sourceUrl:'https://secret:password@example.com/recipe',instructions:['Simmer.'],ingredients:[{name:'Carrot',quantity:2,unit:'',preparation:'chopped',ingredientId:'internal',originalText:'raw import'}]},true);
 assert.equal(result.imageUrl,'');assert.equal(result.sourceUrl,'');assert.deepEqual(result.ingredients,[{name:'Carrot',quantity:2,unit:'',preparation:'chopped'}]);
 for(const value of ['Private diary','private-user','private@example.invalid','Private collection','internal','raw import'])assert.ok(!JSON.stringify(result).includes(value));
 assert.deepEqual(result.instructions,['Simmer.']);
});
test('community feed summaries omit method and ingredient payloads',()=>{
 const result=publicRecipe({id:'recipe',instructions:['Method'],ingredients:[{name:'Carrot'}]});
 assert.ok(!('instructions' in result));assert.ok(!('ingredients' in result));
});
test('public comment responses do not expose commenter identity or account email',()=>{
 const result=publicComment({id:'comment',body:'A little more lemon worked well.',authorName:'Table cook',user_id:'secret-user',email:'secret@example.invalid',createdAt:'date',updatedAt:'date',canEdit:false,canDelete:true});
 assert.equal(result.authorName,'Table cook');assert.equal(result.canDelete,true);assert.ok(!JSON.stringify(result).includes('secret'));
});
test('community cursors retain timestamp and identity ties and reject invalid input',()=>{
 const id='6f1dfb17-056c-46b1-8fd6-5417bd2719ec';
 const cursor=communityCursor('2026-10-30T12:00:00Z',id);
 assert.deepEqual(readCommunityCursor(cursor),['2026-10-30T12:00:00.000Z',id]);
 assert.deepEqual(readCommunityCursor(null),[null,null]);
 for(const invalid of ['bad',cursor+'|extra','2026-10-30T12:00:00.000Z|not-a-uuid'])assert.throws(()=>readCommunityCursor(invalid));
});

test("community pagination preserves PostgreSQL microseconds between adjacent records",()=>{
 const id="6f1dfb17-056c-46b1-8fd6-5417bd2719ec";
 const timestamp="2026-10-30T12:00:00.123456Z";
 assert.deepEqual(readCommunityCursor(communityCursor(timestamp,id)),[timestamp,id]);
});
