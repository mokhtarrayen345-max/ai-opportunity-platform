import dns from "node:dns/promises";
import net from "node:net";

export type ResolvedDiagnosticAddress = { address: string; family: 4 | 6 };
export type DiagnosticResolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultResolver: DiagnosticResolver = async hostname =>
  dns.lookup(hostname, { all: true, verbatim: true });

function ipv4IsPublic(address: string): boolean {
  if (!net.isIPv4(address)) return false;
  const p = address.split(".").map(Number);
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function ipv6Groups(address: string): number[] | null {
  const value = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (value.includes("%")) return null;
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    if (lastColon < 0) return null;
    const v4 = value.slice(lastColon + 1);
    if (!net.isIPv4(v4)) return null;
    const octets = v4.split(".").map(Number);
    const high = (octets[0] << 8) | octets[1];
    const low = (octets[2] << 8) | octets[3];
    return ipv6Groups(value.slice(0, lastColon + 1) + high.toString(16) + ":" + low.toString(16));
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if ([...left, ...right].some(g => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right].map(g => Number.parseInt(g, 16));
  return groups.length === 8 ? groups : null;
}

export function isPublicDiagnosticAddress(address: string): boolean {
  const value = address.replace(/^\[|\]$/g, "");
  if (value.includes("%")) return false;
  if (net.isIPv4(value)) return ipv4IsPublic(value);
  if (!net.isIPv6(value)) return false;
  const groups = ipv6Groups(value);
  if (!groups) return false;
  // Reject IPv4-mapped IPv6 rather than depending on platform-specific routing behavior.
  if (groups.slice(0, 5).every(g => g === 0) && groups[5] === 0xffff) return false;
  // Permit only global-unicast space and conservatively reject special-use/transition ranges.
  if (groups[0] < 0x2000 || groups[0] > 0x3fff) return false;
  if (groups[0] === 0x2001 && (groups[1] <= 0x01ff || groups[1] === 0x0db8)) return false;
  if (groups[0] === 0x2002) return false; // 6to4 transition space
  return true;
}

function canonicalHostname(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function validateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("The diagnostic URL is malformed.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS targets are allowed.");
  }
  if (url.username || url.password) throw new Error("Embedded credentials are not allowed.");
  if (!url.hostname || (url.port && Number(url.port) === 0)) {
    throw new Error("The diagnostic URL has an invalid host or port.");
  }
  const hostname = canonicalHostname(url);
  if (!hostname || hostname.includes("%") || hostname.endsWith("..")) {
    throw new Error("The diagnostic hostname is not allowed.");
  }
  if (/^(?:0x[0-9a-f]+|[0-9.]+)$/i.test(hostname) && !net.isIP(hostname)) {
    throw new Error("Ambiguous numeric hostnames are not allowed.");
  }
  if (!net.isIP(hostname)) {
    if (!hostname.includes(".") || hostname.length > 253 ||
        hostname.split(".").some(label => !label || label.length > 63 ||
          !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) {
      throw new Error("The diagnostic hostname is not allowed.");
    }
    if (hostname === "localhost" || hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") || hostname.endsWith(".internal") ||
        hostname.endsWith(".home") || hostname.endsWith(".lan")) {
      throw new Error("Local or internal targets are not allowed.");
    }
  }
  url.hash = "";
  return url;
}

export async function resolveSafeDiagnosticUrl(
  raw: string,
  origin?: string,
  resolver: DiagnosticResolver = defaultResolver,
): Promise<{ url: URL; addresses: ResolvedDiagnosticAddress[] }> {
  const url = validateUrl(raw);
  if (origin) {
    let base: URL;
    try { base = new URL(origin); } catch { throw new Error("The diagnostic origin is invalid."); }
    if (url.protocol !== base.protocol || url.origin !== base.origin) {
      throw new Error("Diagnostic endpoints must remain on the target origin.");
    }
  }
  const hostname = canonicalHostname(url);
  if (net.isIP(hostname)) {
    if (!isPublicDiagnosticAddress(hostname)) throw new Error("Private or local targets are not allowed.");
    return { url, addresses: [{ address: hostname, family: net.isIPv4(hostname) ? 4 : 6 }] };
  }
  let answers: Array<{ address: string; family: number }>;
  try { answers = await resolver(hostname); } catch { throw new Error("Target DNS resolution failed."); }
  if (!answers.length) throw new Error("Target DNS resolution returned no addresses.");
  const addresses: ResolvedDiagnosticAddress[] = [];
  for (const answer of answers) {
    const family = net.isIP(answer.address);
    if (!family || family !== answer.family || !isPublicDiagnosticAddress(answer.address)) {
      throw new Error("Target resolves to a private or non-public network address.");
    }
    addresses.push({ address: answer.address, family: family as 4 | 6 });
  }
  return { url, addresses };
}
