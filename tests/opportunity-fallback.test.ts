import {describe,expect,it,vi} from "vitest";
import {createProviders} from "@/services/ai";
describe("opportunity provider fallback",()=>{
 it("uses mock when OpenAI key is missing",async()=>{const p=createProviders({NODE_ENV:"test",AI_PROVIDER:"openai",OPENAI_API_KEY:""},fetch);const r=await p.opportunity.analyzeOpportunity("A recurring business problem");expect(r.userProvidedFacts.length).toBeGreaterThan(0);});
 it("falls back when OpenAI request fails",async()=>{const fetcher=vi.fn().mockRejectedValue(new Error("network"));const p=createProviders({NODE_ENV:"test",AI_PROVIDER:"openai",OPENAI_API_KEY:"test",OPENAI_MODEL:"gpt-test"},fetcher);const r=await p.opportunity.analyzeOpportunity("A recurring business problem");expect(r.unknowns.length).toBeGreaterThan(0);});
});
