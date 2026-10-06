import { notFound } from "next/navigation";
import { opportunities } from "@/lib/mock-data";
import { AnalysisPanel } from "@/components/analysis-panel";
export default async function Analyze({params}:{params:Promise<{id:string}>}){const {id}=await params; const item=opportunities.find(x=>x.id===id); if(!item) notFound(); return <div className="container page"><p className="eyebrow">AI Analysis</p><h1>{item.title}</h1><p className="lead narrow">{item.summary}</p><AnalysisPanel itemId={item.id}/></div>}