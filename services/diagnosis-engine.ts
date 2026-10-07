import {getPrisma} from "@/lib/db";
import {evaluateEvidenceQuality} from "@/services/intelligence-validation-domain";
import {runAvailabilityCheck,runTlsCheck,runConfiguredEndpointCheck,type CheckContext} from "@/services/diagnosis-checks";
import {overallDiagnosisStatus} from "@/services/diagnosis-domain";
export async function runDiagnosis(userId:string,targetId:string){
 const prisma=getPrisma(),target=await prisma.diagnosisTarget.findFirst({where:{id:targetId,userId}});
 if(!target)throw new Error("Diagnosis target not found.");if(!target.enabled)throw new Error("Diagnosis target is disabled.");
 const run=await prisma.diagnosisRun.create({data:{userId,targetId,status:"RUNNING",checksPerformed:[],checksSkipped:[],report:{}}});
 const ctx:CheckContext={target:{id:target.id,normalizedUrl:target.normalizedUrl,protocol:target.protocol,healthEndpoint:target.healthEndpoint,apiEndpoint:target.apiEndpoint},findings:[],checksPerformed:[],checksSkipped:[]};
 let completed=0,failed=0;
 for(const check of [runAvailabilityCheck,runTlsCheck,runConfiguredEndpointCheck]){try{await check(ctx);completed++}catch{failed++}}
 const saved:any[]=[];
 for(const f of ctx.findings){
  const eq=evaluateEvidenceQuality([{title:f.title,summary:f.description,observedAt:new Date(),sourceType:"diagnostic",sourceId:target.id,fingerprint:target.id+":"+f.category+":"+f.title+":"+(f.observedValue??""),evidenceConfidence:f.confidence,severity:f.severity==="CRITICAL"?100:f.severity==="HIGH"?80:f.severity==="MEDIUM"?60:f.severity==="LOW"?40:20,urgency:f.severity==="HIGH"||f.severity==="CRITICAL"?80:40}],target.normalizedUrl);
  saved.push(await prisma.diagnosticFinding.create({data:{userId,targetId:target.id,runId:run.id,category:f.category,title:f.title,description:f.description,severity:f.severity,status:f.status,observedValue:f.observedValue,expectedValue:f.expectedValue,evidence:{observed:String(f.evidence),evidenceQuality:eq},rootCauseHypothesis:f.rootCauseHypothesis,confidence:f.confidence,facts:f.facts,hypotheses:f.hypotheses,unknowns:f.unknowns,recommendation:f.recommendation,estimatedEffortMinutes:f.estimatedEffortMinutes}}));
 }
 const overallStatus=overallDiagnosisStatus(ctx.findings,completed,failed),report={target:{id:target.id,url:target.normalizedUrl,type:target.targetType},diagnosedAt:new Date().toISOString(),overallStatus,totalFindings:saved.length,findingsBySeverity:Object.fromEntries(["INFO","LOW","MEDIUM","HIGH","CRITICAL"].map(s=>[s,saved.filter(f=>f.severity===s).length])),keyProblems:saved.slice(0,10).map(f=>f.title),evidence:saved.map(f=>f.evidence),rootCauseHypotheses:saved.map(f=>f.rootCauseHypothesis).filter(Boolean),recommendations:saved.map(f=>f.recommendation),estimatedRepairEffortMinutes:saved.reduce((n,f)=>n+f.estimatedEffortMinutes,0),limitations:["Bounded, non-invasive checks from one server-side vantage point.","Findings are indicators unless the observed result directly proves the fact.","No exploitation, authentication bypass, port scanning, arbitrary crawling, or destructive request was performed."],checksPerformed:ctx.checksPerformed,checksSkipped:ctx.checksSkipped,checksFailed:failed};
 const updated=await prisma.diagnosisRun.update({where:{id:run.id},data:{status:"COMPLETED",completedAt:new Date(),overallStatus,totalFindings:saved.length,checksPerformed:ctx.checksPerformed,checksSkipped:ctx.checksSkipped,report}});
 return {run:updated,findings:saved,report};
}