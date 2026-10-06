import { z } from "zod";
export const credentialsSchema=z.object({
 email:z.string().trim().email().max(320),
 password:z.string().min(8).max(128),
 name:z.string().trim().min(1).max(80).optional(),
});
export const problemSchema=z.object({problem:z.string().trim().min(10).max(4000)});
export const analysisSchema=z.object({itemId:z.string().min(1).max(100)});
