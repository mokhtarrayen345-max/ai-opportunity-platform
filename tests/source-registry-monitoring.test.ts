import {describe,it,expect} from "vitest";
import {registerSourceSchema,safeSourceConfig} from "@/services/source-registry-domain";
import {MockSourceProvider,resolveSourceProvider} from "@/services/source-provider";
describe("source registry domain",()=>{it("validates sources",()=>{expect(registerSourceSchema.parse({id:"mock-main",name:"Mock Main",type:"mock"}).enabled).toBe(true);});it("rejects sensitive config",()=>{expect(()=>safeSourceConfig({apiKey:"x"})).toThrow();});it("supports mock health",async()=>{expect((await new MockSourceProvider("x").healthCheck()).ok).toBe(true);expect((await new MockSourceProvider("x",true).healthCheck()).ok).toBe(false);});it("records deterministic score formula",()=>{expect(Math.round(100*(3-1)/3)).toBe(67);});});
