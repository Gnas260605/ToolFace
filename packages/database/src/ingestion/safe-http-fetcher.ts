/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const */
import dns from 'dns';
import ipaddr from 'ipaddr.js';
import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface SafeFetchOptions {
  maxBytes?: number;
  connectTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxRedirects?: number;
  allowHttpInDev?: boolean;
  allowedLocalHosts?: string[];
  userAgent?: string;
}

export interface SafeFetchResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export function isPrivateIp(ip: string): boolean {
  try {
    const addr = ipaddr.parse(ip);
    const range = addr.range();
    const blockedRanges = [
      'loopback',
      'private',
      'linkLocal',
      'unspecified',
      'broadcast',
      'multicast',
      'reserved',
      'uniqueLocal',
    ];

    if (blockedRanges.includes(range)) {
      return true;
    }

    if (ip === '169.254.169.254') {
      return true;
    }

    return false;
  } catch (e) {
    return true;
  }
}

export async function resolveIp(hostname: string): Promise<string> {
  return new Promise((resolve, reject) => {
    dns.resolve(hostname, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        // Fallback to dns.lookup for hosts file or local resolution
        dns.lookup(hostname, (lookupErr, address) => {
          if (lookupErr || !address) {
            reject(new Error('SOURCE_INVALID_URL'));
          } else {
            resolve(address);
          }
        });
      } else {
        resolve(addresses[0]);
      }
    });
  });
}

function isUrlAllowed(url: URL, options: SafeFetchOptions): boolean {
  // Allow only https, or http in development mode for allowed hosts
  if (url.protocol === 'http:') {
    if (!options.allowHttpInDev) {
      return false;
    }
    const hostname = url.hostname.toLowerCase();
    const allowedHosts = options.allowedLocalHosts || ['localhost', '127.0.0.1', 'minio'];
    if (!allowedHosts.includes(hostname)) {
      return false;
    }
  } else if (url.protocol !== 'https:') {
    return false;
  }

  // Reject credentials in URL
  if (url.username || url.password) {
    return false;
  }

  return true;
}

export async function safeFetch(targetUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024; // Default: 5MB
  const connectTimeoutMs = options.connectTimeoutMs ?? 5000;
  const totalTimeoutMs = options.totalTimeoutMs ?? 15000;
  const userAgent = options.userAgent ?? 'NewsFlowAI/0.1.0 Ingestion Engine';

  let currentUrl = targetUrl;
  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(currentUrl);
    } catch {
      throw new Error('SOURCE_INVALID_URL');
    }

    if (!isUrlAllowed(parsedUrl, options)) {
      throw new Error('SOURCE_BLOCKED_URL');
    }

    // Resolve IP and validate
    const hostname = parsedUrl.hostname;
    const ip = await resolveIp(hostname);
    if (isPrivateIp(ip)) {
      // Check if it's explicitly allowed in local hosts in dev mode
      const isAllowedLocal = options.allowHttpInDev && (options.allowedLocalHosts || ['localhost', '127.0.0.1', 'minio']).includes(hostname);
      if (!isAllowedLocal) {
        throw new Error('SOURCE_PRIVATE_NETWORK_BLOCKED');
      }
    }

    const result = await new Promise<SafeFetchResult | { redirectUrl: string }>((resolve, reject) => {
      const isHttps = parsedUrl.protocol === 'https:';
      const requestModule = isHttps ? https : http;

      const headers: Record<string, string> = {
        'User-Agent': userAgent,
        'Accept': 'application/xml, text/xml, application/atom+xml, text/html, */*',
      };

      const reqOptions: http.RequestOptions & https.RequestOptions = {
        method: 'GET',
        hostname: ip,
        path: parsedUrl.pathname + parsedUrl.search,
        port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : (isHttps ? 443 : 80),
        headers,
        rejectUnauthorized: true, // strict TLS checks
      };

      if (isHttps) {
        // Enforce Server Name Indication (SNI) matching original host
        reqOptions.servername = hostname;
        reqOptions.headers = {
          ...headers,
          Host: hostname,
        };
      }

      let totalTimeoutTimer: NodeJS.Timeout | undefined;

      const req = requestModule.request(reqOptions as any, (res) => {
        const statusCode = res.statusCode || 200;

        // Handle Redirects
        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          const location = res.headers.location;
          if (!location) {
            reject(new Error('SOURCE_REDIRECT_BLOCKED'));
            return;
          }
          let nextUrl: URL;
          try {
            nextUrl = new URL(location, parsedUrl.href);
          } catch {
            reject(new Error('SOURCE_REDIRECT_BLOCKED'));
            return;
          }
          if (totalTimeoutTimer) {
            clearTimeout(totalTimeoutTimer);
          }
          resolve({ redirectUrl: nextUrl.href });
          return;
        }

        let bytesRead = 0;
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          bytesRead += chunk.length;
          if (bytesRead > maxBytes) {
            req.destroy();
            reject(new Error('SOURCE_RESPONSE_TOO_LARGE'));
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          if (totalTimeoutTimer) {
            clearTimeout(totalTimeoutTimer);
          }
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: statusCode,
            headers: res.headers,
            body,
          });
        });
      });

      // Connection Timeout
      req.on('socket', (socket) => {
        socket.setTimeout(connectTimeoutMs);
        socket.on('timeout', () => {
          req.destroy();
          reject(new Error('SOURCE_FETCH_TIMEOUT'));
        });
      });

      // Total request timeout
      totalTimeoutTimer = setTimeout(() => {
        req.destroy();
        reject(new Error('SOURCE_FETCH_TIMEOUT'));
      }, totalTimeoutMs);

      req.on('error', (err) => {
        if (totalTimeoutTimer) {
          clearTimeout(totalTimeoutTimer);
        }
        reject(new Error(err.message === 'PRIVATE_NETWORK_BLOCKED' ? 'SOURCE_PRIVATE_NETWORK_BLOCKED' : 'SOURCE_FETCH_FAILED'));
      });

      req.end();
    });

    if ('redirectUrl' in result) {
      currentUrl = result.redirectUrl;
      redirectCount++;
    } else {
      return result;
    }
  }

  throw new Error('SOURCE_REDIRECT_BLOCKED');
}
