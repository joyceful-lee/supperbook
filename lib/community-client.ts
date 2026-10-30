export async function communityRequest<T=unknown>(input:string|Record<string,unknown>):Promise<T> {
 const response=await fetch('/api/community'+(typeof input==='string'?input:''),{
  cache:'no-store',signal:AbortSignal.timeout(20000),
  ...(typeof input==='string'?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),
 });
 const data=await response.json();
 if(!response.ok)throw new Error(data.error||'Your change could not be saved.');
 return data as T;
}
