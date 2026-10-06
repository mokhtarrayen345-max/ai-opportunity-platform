import {createHash} from "node:crypto";
import type {RawSourceItem} from "@/services/intelligence-domain";
export function fingerprintSourceItem(raw:RawSourceItem):string{
  const key=raw.externalId?.trim()
    ? ["external",raw.sourceType,raw.sourceName,raw.externalId.trim()].join("|")
    : ["content",raw.sourceType,raw.sourceName,raw.sourceUrl??"",raw.title.trim().toLowerCase(),raw.detectedAt?.toISOString()??"",raw.rawContent.trim().toLowerCase()].join("|");
  return createHash("sha256").update(key,"utf8").digest("hex");
}
