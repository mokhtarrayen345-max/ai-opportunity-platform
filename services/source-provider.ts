import "server-only";
export type ProviderHealth={ok:boolean;error?:string};
export interface SourceProvider{readonly sourceId:string;readonly type:string;healthCheck():Promise<ProviderHealth>;}
export class MockSourceProvider implements SourceProvider{constructor(public readonly sourceId:string,private readonly shouldFail=false,private readonly delayMs=0){}async healthCheck(){if(this.delayMs>0)await new Promise(r=>setTimeout(r,this.delayMs));if(this.shouldFail)return {ok:false,error:"Mock provider health check failed."};return {ok:true};}}
export function resolveSourceProvider(source:{id:string;type:string;config:Record<string,unknown>}):SourceProvider{if(source.type==="mock"||source.type==="internal")return new MockSourceProvider(source.id,source.config.failHealth===true,typeof source.config.delayMs==="number"?source.config.delayMs:0);throw new Error("No provider registered for this source type.");}
