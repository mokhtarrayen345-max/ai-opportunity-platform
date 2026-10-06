import {describe,expect,it,vi,beforeEach} from "vitest";
const db={analysisRecord:{create:vi.fn()},solverRecord:{create:vi.fn()},analysisRecordFindMany:vi.fn(),solverRecordFindMany:vi.fn()};
vi.mock("@/lib/db",()=>({getPrisma:()=>({analysisRecord:{create:db.analysisRecord.create,findMany:db.analysisRecordFindMany},solverRecord:{create:db.solverRecord.create,findMany:db.solverRecordFindMany}})}));
import {saveAnalysis,saveSolverResult,getUserHistory} from "@/services/persistence";
describe("user-owned persistence",()=>{
 beforeEach(()=>vi.clearAllMocks());
 it("writes analysis records with the authenticated user id",async()=>{await saveAnalysis("user-a","local-logistics",{opportunity:"x",confidence:80,whyItMatters:"y",nextSteps:["z"]});expect(db.analysisRecord.create).toHaveBeenCalledWith({data:expect.objectContaining({userId:"user-a",itemId:"local-logistics"})});});
 it("writes solver records with the authenticated user id",async()=>{await saveSolverResult("user-b","A valid problem",{summary:"s",steps:["a"],risks:["r"]});expect(db.solverRecord.create).toHaveBeenCalledWith({data:expect.objectContaining({userId:"user-b",problem:"A valid problem"})});});
 it("scopes history queries to the authenticated user",async()=>{db.analysisRecordFindMany.mockResolvedValue([]);db.solverRecordFindMany.mockResolvedValue([]);await getUserHistory("user-c");expect(db.analysisRecordFindMany).toHaveBeenCalledWith({where:{userId:"user-c"},orderBy:{createdAt:"desc"},take:50});expect(db.solverRecordFindMany).toHaveBeenCalledWith({where:{userId:"user-c"},orderBy:{createdAt:"desc"},take:50});});
});
