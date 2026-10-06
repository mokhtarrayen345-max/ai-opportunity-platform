import {describe,expect,it} from "vitest";
import {credentialsSchema,problemSchema,analysisSchema} from "@/lib/validation";
describe("request validation",()=>{
 it("accepts valid credentials",()=>expect(credentialsSchema.safeParse({email:"user@example.com",password:"password123"}).success).toBe(true));
 it("rejects weak credentials",()=>expect(credentialsSchema.safeParse({email:"bad",password:"short"}).success).toBe(false));
 it("rejects oversized solver input",()=>expect(problemSchema.safeParse({problem:"x".repeat(4001)}).success).toBe(false));
 it("accepts an analysis item id",()=>expect(analysisSchema.safeParse({itemId:"local-logistics"}).success).toBe(true));
});