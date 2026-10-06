import {describe,expect,it} from "vitest";
import {z} from "zod";
const schema=z.object({problem:z.string().trim().min(10).max(4000)});
describe("problem validation",()=>{it("accepts a valid problem",()=>{expect(schema.safeParse({problem:"Customers cannot track delivery status."}).success).toBe(true);});it("rejects a short problem",()=>{expect(schema.safeParse({problem:"too short"}).success).toBe(false);});it("rejects an oversized problem",()=>{expect(schema.safeParse({problem:"x".repeat(4001)}).success).toBe(false);});});});