import {describe,expect,it,vi} from "vitest";
import {rawSourceItemSchema,normalizeRawSourceItem} from "@/services/intelligence-domain";
import {fingerprintSourceItem} from "@/services/intelligence-fingerprint";
import {DeterministicSignalClassifier} from "@/services/intelligence-classifier";
import {MockIntelligenceSource} from "@/services/intelligence-source";
describe("intelligence foundation",()=>{
 const raw={title:"Users report broken workflow",summary:"Teams complain about a broken handoff.",sourceType:"mock" as const,sourceName:"Fixture",externalId:"x-1",detectedAt:"2026-10-06T12:00:00.000Z",receivedAt:"2026-10-06T12:00:05.000Z",topic:"workflow",entities:["team","team"],rawContent:"A complaint about a broken workflow.",metadata:{}};
 it("validates and normalizes timestamps",()=>{const p=rawSourceItemSchema.parse(raw);const n=normalizeRawSourceItem(p);expect(n.detectedAt).toBe("2026-10-06T12:00:00.000Z");expect(n.entities).toEqual(["team"]);});
 it("fingerprints deterministically",()=>{const p=rawSourceItemSchema.parse(raw);expect(fingerprintSourceItem(p)).toBe(fingerprintSourceItem(p));expect(fingerprintSourceItem(p)).toHaveLength(64);});
 it("classifies deterministically",()=>{const c=new DeterministicSignalClassifier().classify({title:raw.title,summary:raw.summary,normalizedContent:raw.rawContent,topic:raw.topic});expect(c.signalType).toBe("user_complaint");});
 it("provides deterministic mock fixtures",async()=>{const items=await new MockIntelligenceSource().discover();expect(items).toHaveLength(2);expect(items[0].externalId).toBe("fixture-001");});
 it("rejects malformed input safely",()=>{expect(rawSourceItemSchema.safeParse({title:""}).success).toBe(false);});
});
