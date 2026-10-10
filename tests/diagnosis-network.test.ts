import { EventEmitter } from "node:events";
import type { IncomingHttpHeaders } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  buildPinnedRequestOptions,
  createPinnedLookup,
  fetchPinnedWithRedirects,
  isPublicDiagnosticAddress,
  requestPinnedDiagnostic,
  resolveSafeDiagnosticUrl,
  type DiagnosticRequestFactory,
  type DiagnosticResponseHandle,
  type PinnedDiagnosticResponse,
  type SafeDiagnosticResolution,
} from "@/services/diagnosis-network";
import { getCertificateMetadata } from "@/services/diagnosis-checks";

const publicV4 = { address: "93.184.216.34", family: 4 as const };
const publicV6 = { address: "2606:4700:4700::1111", family: 6 as const };
const resolverFor = (...answers: Array<{ address: string; family: number }>) => vi.fn(async () => answers);
const response = (status: number, headers: Record<string, string> = {}, body = "", validTo: string | null = null): PinnedDiagnosticResponse => ({
  status,
  headers: { get: name => headers[name.toLowerCase()] ?? null },
  body,
  durationMs: 12,
  validTo,
});

function fakeRequestFactory(
  status: number,
  headers: Record<string, string> = {},
  body = "",
  validTo: string | null = null,
  capture?: (options: Parameters<DiagnosticRequestFactory>[1]) => void,
): DiagnosticRequestFactory {
  return (_protocol, options, onResponse) => {
    capture?.(options);
    const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    request.destroy = vi.fn();
    request.end = () => {
      const incoming = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: IncomingHttpHeaders;
        socket: { getPeerCertificate: () => { valid_to?: string } };
        destroy: () => void;
      };
      incoming.statusCode = status;
      incoming.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])) as IncomingHttpHeaders;
      incoming.socket = { getPeerCertificate: () => validTo ? { valid_to: validTo } : {} };
      incoming.destroy = vi.fn();
      queueMicrotask(() => {
        onResponse(incoming as unknown as DiagnosticResponseHandle);
        if (body) incoming.emit("data", Buffer.from(body));
        incoming.emit("end");
      });
    };
    return request as unknown as Parameters<DiagnosticRequestFactory>[0] extends never ? never : ReturnType<DiagnosticRequestFactory>;
  };
}

describe("diagnostic destination validation", () => {
  it("accepts public IPv4 and IPv6 literals", async () => {
    expect((await resolveSafeDiagnosticUrl("https://93.184.216.34/")).addresses[0]).toEqual(publicV4);
    expect((await resolveSafeDiagnosticUrl("https://[2606:4700:4700::1111]/")).addresses[0]).toEqual(publicV6);
  });

  it.each([
    "0.0.0.0", "10.0.0.1", "127.0.0.1", "169.254.1.1", "172.16.0.1",
    "192.168.1.1", "192.0.2.1", "192.88.99.1", "198.18.0.1", "198.51.100.1",
    "203.0.113.1", "100.64.0.1", "224.0.0.1", "240.0.0.1",
    "::", "::1", "fc00::1", "fd12::1", "fe80::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "2001:db8::1", "2001:ffff::1", "3fff::1",
  ])("rejects non-public IP address %s", address => {
    expect(isPublicDiagnosticAddress(address)).toBe(false);
  });

  it("rejects IPv6 zone identifiers", async () => {
    await expect(resolveSafeDiagnosticUrl("https://[fe80::1%25eth0]/")).rejects.toThrow();
  });

  it("rejects DNS answers containing a private address even when a public answer is present", async () => {
    const resolver = resolverFor(publicV4, { address: "10.0.0.7", family: 4 });
    await expect(resolveSafeDiagnosticUrl("https://example.com/", undefined, resolver))
      .rejects.toThrow("non-public network address");
  });

  it("rejects DNS errors and empty answers", async () => {
    await expect(resolveSafeDiagnosticUrl("https://example.com/", undefined, async () => { throw new Error("private DNS detail"); }))
      .rejects.toThrow("Target DNS resolution failed");
    await expect(resolveSafeDiagnosticUrl("https://example.com/", undefined, async () => []))
      .rejects.toThrow("no addresses");
  });

  it.each([
    "ftp://example.com/", "https://user:secret@example.com/", "https://example.com:99999/",
    "http://2130706433/", "http://localhost/", "http://service.internal/",
  ])("rejects malformed or unsafe URL %s", async url => {
    await expect(resolveSafeDiagnosticUrl(url, undefined, resolverFor(publicV4))).rejects.toThrow();
  });
});

describe("pinned diagnostic transport", () => {
  it("passes the validated IP to the connection lookup while retaining the hostname", async () => {
    const resolver = resolverFor(publicV4);
    const resolved = await resolveSafeDiagnosticUrl("https://example.com/health", undefined, resolver);
    let captured: ReturnType<typeof buildPinnedRequestOptions> | undefined;
    const factory = fakeRequestFactory(200, { "content-type": "text/plain" }, "ok", null, options => {
      captured = options;
      const lookup = options.lookup as unknown as (
        host: string,
        options: object,
        callback: (error: Error | null, address: string | Array<{ address: string; family: number }>, family?: number) => void,
      ) => void;
      lookup(options.hostname, {}, (error, address) => {
        expect(error).toBeNull();
        expect(address).toBe(publicV4.address);
      });
    });
    await requestPinnedDiagnostic(resolved, "GET", 1024, 100, factory);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(captured?.hostname).toBe("example.com");
    expect(captured?.servername).toBe("example.com");
    expect(captured?.rejectUnauthorized).toBe(true);
    expect(captured?.headers.Host).toBe("example.com");
  });

  it("pins the HTTPS certificate metadata request and keeps certificate validation enabled", async () => {
    let captured: ReturnType<typeof buildPinnedRequestOptions> | undefined;
    const factory = fakeRequestFactory(200, { "content-length": "50000" }, "", "Jan  1 00:00:00 2027 GMT", options => { captured = options; });
    const metadata = await getCertificateMetadata("https://example.com/", resolverFor(publicV4), factory);
    expect(metadata.validTo).toBe("Jan  1 00:00:00 2027 GMT");
    expect(captured?.method).toBe("HEAD");
    expect(captured?.lookup).toBeTypeOf("function");
    expect(captured?.servername).toBe("example.com");
    expect(captured?.rejectUnauthorized).toBe(true);
    expect(captured?.headers.Host).toBe("example.com");
  });

  it("uses the selected validated IP instead of performing a second DNS lookup", async () => {
    const resolver = vi.fn(async () => publicV4);
    const resolved = await resolveSafeDiagnosticUrl("https://example.com/", undefined, async () => [publicV4]);
    const lookup = createPinnedLookup("example.com", resolved.addresses);
    const address = await new Promise<string>((resolve, reject) => {
      lookup("example.com", {}, (error, value) => {
        if (error) reject(error);
        else if (typeof value === "string") resolve(value);
        else reject(new Error("Expected one pinned address"));
      });
    });
    expect(address).toBe(publicV4.address);
    expect(resolver).not.toHaveBeenCalled();
  });

  it("fails if the connection layer requests a hostname other than the validated host", async () => {
    const lookup = createPinnedLookup("example.com", [publicV4]);
    await expect(new Promise((resolve, reject) => {
      lookup("attacker.example", {}, (error) => error ? reject(error) : resolve(null));
    })).rejects.toThrow("hostname changed");
  });

  it("enforces the response size limit", async () => {
    const resolved = await resolveSafeDiagnosticUrl("http://example.com/", undefined, resolverFor(publicV4));
    await expect(requestPinnedDiagnostic(resolved, "GET", 4, 100, fakeRequestFactory(200, {}, "too large")))
      .rejects.toThrow("size limit");
  });

  it("enforces the request timeout", async () => {
    const resolved = await resolveSafeDiagnosticUrl("http://example.com/", undefined, resolverFor(publicV4));
    const factory: DiagnosticRequestFactory = () => {
      const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
      request.end = () => undefined;
      request.destroy = vi.fn();
      return request as unknown as ReturnType<DiagnosticRequestFactory>;
    };
    await expect(requestPinnedDiagnostic(resolved, "GET", 1024, 5, factory)).rejects.toThrow("timed out");
  });
});

describe("pinned redirect handling", () => {
  it("re-resolves and pins every same-origin redirect", async () => {
    const resolver = vi.fn(async () => [publicV4]);
    const request = vi.fn()
      .mockResolvedValueOnce(response(302, { location: "/next" }))
      .mockResolvedValueOnce(response(302, { location: "/final" }))
      .mockResolvedValueOnce(response(200, {}, "ok"));
    const result = await fetchPinnedWithRedirects("https://example.com/start", "https://example.com/start", {
      resolver,
      request,
      maxRedirects: 3,
    });
    expect(result.redirects).toBe(2);
    expect(result.finalUrl).toBe("https://example.com/final");
    expect(resolver).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.every(call => call[0].addresses[0].address === publicV4.address)).toBe(true);
  });

  it.each(["http://127.0.0.1/admin", "http://localhost/admin", "https://other.example/admin"])(
    "rejects redirect to a different or internal origin: %s", async location => {
      const request = vi.fn().mockResolvedValue(response(302, { location }));
      await expect(fetchPinnedWithRedirects("https://example.com/start", "https://example.com/start", {
        resolver: resolverFor(publicV4),
        request,
      })).rejects.toThrow();
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects a same-host redirect when DNS changes to a private address", async () => {
    const resolver = vi.fn()
      .mockResolvedValueOnce([publicV4])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const request = vi.fn().mockResolvedValue(response(302, { location: "/next" }));
    await expect(fetchPinnedWithRedirects("https://example.com/start", "https://example.com/start", { resolver, request }))
      .rejects.toThrow("non-public network address");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("stops after the configured redirect limit", async () => {
    const request = vi.fn().mockResolvedValue(response(302, { location: "/again" }));
    await expect(fetchPinnedWithRedirects("https://example.com/start", "https://example.com/start", {
      resolver: resolverFor(publicV4),
      request,
      maxRedirects: 2,
    })).rejects.toThrow("Redirect limit");
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("rejects redirects without a Location header", async () => {
    const request = vi.fn().mockResolvedValue(response(302));
    await expect(fetchPinnedWithRedirects("https://example.com/start", "https://example.com/start", {
      resolver: resolverFor(publicV4),
      request,
    })).rejects.toThrow("no location");
  });
});
