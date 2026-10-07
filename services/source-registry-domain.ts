import {z} from "zod";
export const sourceTypes=["rss","api","social","messaging","website","news","github","market","internal","mock"] as const;
export const sourceStatuses=["UNKNOWN","HEALTHY","DEGRADED","DISABLED"] as const;
const sourceConfigValue=z.union([z.string(),z.number(),z.boolean(),z.null(),z.array(z.string().trim().min(1).max(100)).max(20)]);
export const sourceConfigSchema=z.record(z.string(),sourceConfigValue);
export const sourceSchema=z.object({id:z.string().trim().min(1).max(100),name:z.string().trim().min(1).max(160),type:z.enum(sourceTypes),enabled:z.boolean(),status:z.enum(sourceStatuses),description:z.string().max(1000),config:sourceConfigSchema});
export const registerSourceSchema=z.object({id:z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/),name:z.string().trim().min(1).max(160),type:z.enum(sourceTypes),description:z.string().trim().max(1000).default(""),config:sourceConfigSchema.default({}),enabled:z.boolean().default(true)});
export function safeSourceConfig(config:Record<string,unknown>){const blocked=/(token|secret|password|api[_-]?key|authorization|credential|private[_-]?key)/i;for(const key of Object.keys(config))if(blocked.test(key))throw new Error("Sensitive source configuration is not allowed.");return registerSourceSchema.shape.config.parse(config);}
