import {describe,expect,it,vi} from "vitest";
import {createProviders,getConfiguredProviderName} from "@/services/ai";
describe("AI provider selection and fallback",()=>{
 it("defaults to mock",()=>{expect(getConfiguredProviderName({})).toBe("mock");expect(getConfiguredProviderName({AI_PROVIDER:"unknown"})).toBe("mock");});
 it("selects OpenAI only when configured",()=>{expect(getConfiguredProviderName({AI_PROVIDER:"openai"})).toBe("openai");});
 it("uses mock without an OpenAI key",async()=>{const p=createProviders({AI_PROVIDER:"openai"});expect((await p.analysis.analyze("local-logistics")).confidence).toBe(88);});
 it("falls back safely when OpenAI is unavailable",async()=>{const fetcher=vi.fn().mockRejectedValue(new Error("network failure"));const p=createProviders({AI_PROVIDER:"openai",OPENAI_API_KEY:"test-key",OPENAI_MODEL:"test-model"},fetcher);const r=await p.solver.solve("Our team needs a better way to track customer requests.");expect(r.steps).toHaveLength(4);expect(r.risks).toHaveLength(3);});
});