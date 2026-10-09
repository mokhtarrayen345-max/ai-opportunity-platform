import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { LookupFunction } from "node:dns";
import type { IncomingHttpHeaders } from "node:http";
import type { TLSSocket } from "node:tls";

export type ResolvedDiagnosticAddress = { address: string; family: 4 | 6 };
export type DiagnosticResolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
export type SafeDiagnosticResolution = { url: URL; addresses: ResolvedDiagnosticAddress[] };
export type DiagnosticMethod = "GET" | "HEAD";
export type PinnedRequestOptions = {
  hostname: string;
  port: number;
  path: string;
  method: DiagnosticMethod;
  headers: Record<string, string>;
  lookup: LookupFunction;
  agent: false;
  timeout: number;
  rejectUnauthorized?: boolean;
  servername?: string;
};
export type PinnedDiagnosticResponse = {
  status: number;
  headers: { get(name: string): string | null };
  body: string;
  durationMs: number;
  validTo: string | null;
};

export type DiagnosticResponseHandle = {
  statusCode?: number;
  headers: IncomingHttpHeaders;
  socket?: TLSSocket;
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  destroy(): void;
};
export type DiagnosticRequestHandle = {
  on(event: "error", listener: (error: Error) => void): unknown;
  end(): void;
  destroy(): void;
};
export type DiagnosticRequestFactory = (
  protocol: "http:" | "https:",
  options: PinnedRequestOptions,
  onResponse: (response: DiagnosticResponseHandle) => void,
) => DiagnosticRequestHandle;

const defaultRequestFactory: DiagnosticRequestFactory = (protocol, options, onResponse) => {
  if (protocol === "https:") {
    return https.request(options as https.RequestOptions, response => onResponse(response)) as unknown as DiagnosticRequestHandle;
  }
  return http.request(options as http.RequestOptions, response => onResponse(response)) as unknown as DiagnosticRequestHandle;
};

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
  if (a === 192 && b === 0) return false;
  if (a === 192 && b === 2) return false;
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
  if (groups.slice(0, 5).every(g => g === 0) && groups[5] === 0xffff) return false;
  // Only global-unicast space is eligible; known special-use and transition blocks are rejected.
  if (groups[0] < 0x2000 || groups[0] > 0x3fff) return false;
  if (groups[0] === 0x2001 && (groups[1] <= 0x01ff || groups[1] === 0x0db8)) return false;
  if (groups[0] === 0x2002 || groups[0] === 0x3fff) return false;
  return true;
}

export function canonicalDiagnosticHostname(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

export function validateDiagnosticUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("The diagnostic URL is malformed."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS targets are allowed.");
  if (url.username || url.password) throw new Error("Embedded credentials are not allowed.");
  if (!url.hostname || (url.port && (!Number.isInteger(Number(url.port)) || Number(url.port) < 1 || Number(url.port) > 65535))) {
    throw new Error("The diagnostic URL has an invalid host or port.");
  }
  const hostname = canonicalDiagnosticHostname(url);
  if (!hostname || hostname.includes("%") || hostname.endsWith("..")) throw new Error("The diagnostic hostname is not allowed.");
  if (/^(?:0x[0-9a-f]+|[0-9.]+)$/i.test(hostname) && !net.isIP(hostname)) {
    throw new Error("Ambiguous numeric hostnames are not allowed.");
  }
  if (!net.isIP(hostname)) {
    if (!hostname.includes(".") || hostname.length > 253 ||
        hostname.split(".").some(label => !label || label.length > 63 ||
          !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) {
      throw new Error("The diagnostic hostname is not allowed.");
    }
    if (["localhost", "local", "internal", "home", "lan", "corp", "private", "test", "example", "invalid", "onion"].some(
      suffix => hostname === suffix || hostname.endsWith("." + suffix)
    )) throw new Error("Local or internal targets are not allowed.");
  }
  url.hash = "";
  return url;
}

export async function resolveSafeDiagnosticUrl(
  raw: string,
  origin?: string,
  resolver: DiagnosticResolver = defaultResolver,
): Promise<SafeDiagnosticResolution> {
  const url = validateDiagnosticUrl(raw);
  if (origin) {
    let base: URL;
    try { base = new URL(origin); } catch { throw new Error("The diagnostic origin is invalid."); }
    if (url.protocol !== base.protocol || url.origin !== base.origin) {
      throw new Error("Diagnostic endpoints must remain on the target origin.");
    }
  }
  const hostname = canonicalDiagnosticHostname(url);
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

export function createPinnedLookup(
  expectedHostname: string,
  addresses: ResolvedDiagnosticAddress[],
): LookupFunction {
  const expected = expectedHostname.toLowerCase().replace(/\.$/, "");
  const selected = addresses[0];
  if (!selected || !isPublicDiagnosticAddress(selected.address)) throw new Error("No validated public destination is available.");
  return ((hostname: string, options: { all?: boolean } | number, callback: (...args: unknown[]) => void) => {
    if (hostname.toLowerCase().replace(/\.$/, "") !== expected) {
      const error = Object.assign(new Error("Diagnostic hostname changed during connection."), { code: "ENOTFOUND" });
      callback(error, "", 0);
      return;
    }
    if (typeof options === "object" && options !== null && options.all) {
      callback(null, [{ address: selected.address, family: selected.family }]);
      return;
    }
    callback(null, selected.address, selected.family);
  }) as LookupFunction;
}

export function buildPinnedRequestOptions(
  resolution: SafeDiagnosticResolution,
  method: DiagnosticMethod,
  timeoutMs: number,
): PinnedRequestOptions {
  const { url, addresses } = resolution;
  const hostname = canonicalDiagnosticHostname(url);
  const options: PinnedRequestOptions = {
    hostname,
    port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
    path: url.pathname + url.search,
    method,
    headers: {
      Host: url.host,
      "User-Agent": "AI-Opportunity-Platform-Diagnostics/1.0",
      Accept: "text/html,application/json,text/plain;q=0.8",
    },
    lookup: createPinnedLookup(hostname, addresses),
    agent: false,
    timeout: timeoutMs,
  };
  if (url.protocol === "https:") {
    options.rejectUnauthorized = true;
    if (!net.isIP(hostname)) options.servername = hostname;
  }
  return options;
}

export async function requestPinnedDiagnostic(
  resolution: SafeDiagnosticResolution,
  method: DiagnosticMethod = "GET",
  maxBodyBytes = 1024 * 1024,
  timeoutMs = 8000,
  requestFactory: DiagnosticRequestFactory = defaultRequestFactory,
): Promise<PinnedDiagnosticResponse> {
  const url = resolution.url;
  const options = buildPinnedRequestOptions(resolution, method, timeoutMs);
  const transport = url.protocol === "https:" ? https : http;
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    let total = 0;
    const chunks: Buffer[] = [];
    const finishError = (message: string) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };
    const timer = setTimeout(() => {
      request.destroy();
      finishError("Diagnostic request timed out.");
    }, timeoutMs);
    const request = requestFactory(url.protocol as "http:" | "https:", options, (response: DiagnosticResponseHandle) => {
      const declaredLength = Number(response.headers["content-length"]);
      if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
        response.destroy();
        request.destroy();
        clearTimeout(timer);
        finishError("Response exceeds the diagnostic size limit.");
        return;
      }
      response.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.byteLength;
        if (total > maxBodyBytes) {
          response.destroy();
          request.destroy();
          clearTimeout(timer);
          finishError("Response exceeds the diagnostic size limit.");
          return;
        }
        chunks.push(bytes);
      });
      response.on("error", () => {
        clearTimeout(timer);
        finishError("Diagnostic response failed.");
      });
      response.on("end", () => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        const headers = response.headers as IncomingHttpHeaders;
        const socket = response.socket as TLSSocket;
        let validTo: string | null = null;
        if (url.protocol === "https:") {
          try {
            const cert = socket.getPeerCertificate();
            if (cert?.valid_to) validTo = String(cert.valid_to);
          } catch { validTo = null; }
        }
        resolve({
          status: response.statusCode ?? 0,
          headers: { get: name => {
            const value = headers[name.toLowerCase()];
            return Array.isArray(value) ? value.join(", ") : value ?? null;
          } },
          body: Buffer.concat(chunks).toString("utf8"),
          durationMs: Date.now() - started,
          validTo,
        });
      });
    });
    request.on("error", () => {
      clearTimeout(timer);
      finishError("Diagnostic network request failed.");
    });
    request.end();
  });
}

export type PinnedRedirectOptions = {
  resolver?: DiagnosticResolver;
  request?: typeof requestPinnedDiagnostic;
  maxRedirects?: number;
  maxBodyBytes?: number;
  timeoutMs?: number;
};
export type PinnedRedirectResult = {
  response: PinnedDiagnosticResponse;
  redirects: number;
  finalUrl: string;
};

export async function fetchPinnedWithRedirects(
  raw: string,
  origin: string,
  options: PinnedRedirectOptions = {},
): Promise<PinnedRedirectResult> {
  const resolver = options.resolver ?? defaultResolver;
  const request = options.request ?? requestPinnedDiagnostic;
  const maxRedirects = options.maxRedirects ?? 3;
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 8000;
  let resolution = await resolveSafeDiagnosticUrl(raw, origin, resolver);
  let redirects = 0;
  while (true) {
    const response = await request(resolution, "GET", maxBodyBytes, timeoutMs);
    if (response.status < 300 || response.status >= 400) {
      return { response, redirects, finalUrl: resolution.url.toString() };
    }
    if (redirects >= maxRedirects) throw new Error("Redirect limit exceeded.");
    const location = response.headers.get("location");
    if (!location) throw new Error("Redirect response has no location.");
    resolution = await resolveSafeDiagnosticUrl(new URL(location, resolution.url).toString(), origin, resolver);
    redirects += 1;
  }
}
