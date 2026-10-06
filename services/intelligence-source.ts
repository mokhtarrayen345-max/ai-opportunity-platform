import {rawSourceItemSchema,type RawSourceItem} from "@/services/intelligence-domain";
export interface IntelligenceSourceProvider{
  readonly id:string; readonly sourceType:"mock"|"news"|"social"|"github"|"web"|"other"; readonly name:string;
  discover():Promise<RawSourceItem[]>;
}
export class MockIntelligenceSource implements IntelligenceSourceProvider{
  readonly id="mock-v1"; readonly sourceType="mock" as const; readonly name="Mock Intelligence";
  async discover():Promise<RawSourceItem[]>{
    const items=[{title:"Users report slow project handoffs",summary:"Several teams describe repeated delays when work moves between tools.",sourceType:"mock",sourceName:this.name,externalId:"fixture-001",detectedAt:"2026-10-06T12:00:00.000Z",receivedAt:"2026-10-06T12:00:05.000Z",topic:"workflow",entities:["project teams"],rawContent:"Teams report repeated handoff delays and fragmented status updates.",metadata:{fixture:true}},
    {title:"New AI workflow trend emerges",summary:"Teams are experimenting with AI-assisted internal workflows.",sourceType:"mock",sourceName:this.name,externalId:"fixture-002",detectedAt:"2026-10-06T13:00:00.000Z",receivedAt:"2026-10-06T13:00:05.000Z",topic:"technology",entities:["AI"],rawContent:"Early adopters are testing AI assistance in repetitive workflows.",metadata:{fixture:true}}];
    return items.map(x=>rawSourceItemSchema.parse(x));
  }
}
