import test from 'node:test';
import assert from 'node:assert/strict';
import { mentionsInBody,mentionSegments } from '../lib/threads.ts';
import { publicComment } from '../lib/community.ts';
test('only explicitly selected names present as whole mentions are recipients',()=>{
 const people=[{id:'ann',displayName:'Ann'},{id:'anna',displayName:'Anna'},{id:'jo',displayName:'Jo Lee'}];
 assert.deepEqual(mentionsInBody('Thanks @Anna and @Jo Lee.',people).map(person=>person.id),['anna','jo']);
 assert.deepEqual(mentionsInBody('email@Ann @Annalise @Anna',people).map(person=>person.id),['anna']);
 assert.deepEqual(mentionsInBody('@Ann @Ann',[people[0],people[0]]).map(person=>person.id),['ann']);
});
test('mention rendering keeps ordinary text and overlapping names intact',()=>{
 const result=mentionSegments('Hi @Anna, ask @Ann.',[{id:'a',displayName:'Ann'},{id:'b',displayName:'Anna'}]);
 assert.equal(result.map(part=>part.text).join(''),'Hi @Anna, ask @Ann.');
 assert.deepEqual(result.filter(part=>part.mention).map(part=>part.text),['@Anna','@Ann']);
 assert.deepEqual(mentionSegments('<script>plain text</script>',[]),[{text:'<script>plain text</script>',mention:false}]);
});
test('removed comments do not expose their original author, body, or mentions',()=>{
 const result=publicComment({id:'comment',body:'Private removed text',authorName:'Original cook',authorId:'public-profile',deleted:true,mentions:[{id:'target',displayName:'Target'}],canEdit:true,canDelete:true,canRestore:true,replyCount:3});
 assert.equal(result.body,'');assert.equal(result.authorId,null);assert.equal(result.authorName,'Comment removed');assert.deepEqual(result.mentions,[]);assert.equal(result.canEdit,false);assert.equal(result.canDelete,false);assert.equal(result.canRestore,true);assert.equal(result.replyCount,3);
});
test('reply projections retain the root id without exposing account identifiers',()=>{
 const result=publicComment({id:'reply',parentId:'root',authorId:'opaque-public-id',authorName:'Cook',body:'Thanks @Other',mentions:[{id:'other-public-id',displayName:'Other',user_id:'secret'}],user_id:'private-auth-id'});
 assert.equal(result.parentId,'root');assert.deepEqual(result.mentions,[{id:'other-public-id',displayName:'Other'}]);assert.ok(!JSON.stringify(result).includes('secret'));assert.ok(!JSON.stringify(result).includes('private-auth-id'));
});
