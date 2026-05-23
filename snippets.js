const CONFIG = {
	PUBLIC_ORIGIN: "",        //改成你自己的反代域名
	PROXY_PREFIX: "/emby",
	SIGNING_SECRET: "",	//改成你自己的随机字符串
	SIGNING_TTL_SECONDS: 24 * 60 * 60,
	SIGNING_CLOCK_SKEW_SECONDS: 5 * 60,
	BACKENDS: {}	//上游
};
const INTERNAL_DYNAMIC_SEGMENT = "__proxy";
const SIGN_TS_PARAM = "__px_ts";
const SIGN_EXP_PARAM = "__px_exp";
const SIGN_SIG_PARAM = "__px_sig";
const HOP_BY_HOP_HEADERS = [
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailers",
	"transfer-encoding",
	"upgrade"
];
function cacheCtrl(h, p) {
	if (/^\/web\/|\/(?:css|js|woff2?|ttf|png|jp(?:e?)g|svg|ico|webp)(?:\?|$)/i.test(p))
		h.set("cache-control", "public, max-age=86400, immutable");
	else if (/^\/(?:Items\/[^/]+\/Images|Images)\//i.test(p))
		h.set("cache-control", "public, max-age=3600");
}
const ACCESS_CONTROL_ALLOW_HEADERS =
	"Content-Type, Authorization, X-Emby-Authorization, X-Emby-Token, X-Emby-Client, X-Emby-Device-Id, X-Emby-Device-Name, X-Emby-Client-Version, X-MediaBrowser-Authorization, X-MediaBrowser-Token, X-MediaBrowser-Client, X-MediaBrowser-Device-Id, X-MediaBrowser-Device-Name, X-MediaBrowser-Client-Version, Range, Origin, Referer";
const ACCESS_CONTROL_EXPOSE_HEADERS =
	"Content-Length, Content-Range, Content-Type, Accept-Ranges, X-Emby-Auth-Token, X-MediaBrowser-Auth-Token, Location, Content-Location";
const API_BASE_PREFIXES = ["/emby", "/mediabrowser"];
const TEXT_TYPE_RX =/(?:application\/(?:json|xml|javascript|x-javascript|vnd\.apple\.mpegurl|x-mpegurl|dash\+xml)|application\/[^;]+\+json|text\/(?:plain|html|xml|vtt|json|javascript))/i;
const JSON_TYPE_RX = /application\/json|application\/[^;]+\+json|text\/json/i;
const ABSOLUTE_URL_RX = /https?:\/\/[^\s"'<>\]\)]+/gi;
const ABS_TOKEN_RX = /__EMBY_ABS_(\d+)__/g;
const APIISH_PATH_RX =/\/(?:(?:emby|mediabrowser|Videos|Audio|Items|Images|Users|Playback|PlaybackInfo|PlayQueues|LiveStreams|LiveTv|Sessions|System|Security|web|embywebsocket|socket|Subtitles|Artists|Albums|Genres|Shows|Movies|Channels|Collections|Persons|Studios|Games|Playlists|MusicGenres|Trailers|Packages|Startup|Search|Suggestions|Sync|Devices|UserViews|DisplayPreferences)\b[^\s"'<>\)]*)/g;
const STREAM_PATH_PATTERNS = [
	/^\/Videos\/[^/]+\/(?:stream(?:\.[^/]+)?|original|download|file|master\.m3u8|main\.m3u8|live\.m3u8|subtitles\.m3u8)\b/i,
	/^\/Videos\/[^/]+\/hls1?\/[^/]+\/[^/]+(?:\.[^/]+)?$/i,
	/^\/Videos\/[^/]+\/[^/]+\/Subtitles\/[^/]+(?:\/[^/]+)?\/Stream\.[^/]+$/i,
	/^\/Audio\/[^/]+\/(?:stream(?:\.[^/]+)?|master\.m3u8|main\.m3u8|universal(?:\.[^/]+)?)\b/i,
	/^\/Audio\/[^/]+\/hls1\/[^/]+\/[^/]+(?:\.[^/]+)?$/i,
	/^\/LiveTv\/(?:LiveRecordings|LiveStreamFiles)\/[^/]+\/stream(?:\.[^/]+)?\b/i,
	/^\/(?:Playback|PlayQueues|LiveStreams|Videos\/ActiveEncodings)\b/i
];
const STREAM_QUERY_HINTS = [
	"stream",
	"hls",
	"m3u8",
	"mpd",
	"manifest",
	"playlist",
	"transcod",
	"segment",
	"download",
	"original",
	"live"
];
const BYPASS_CACHE_RX = [
	/^\/Users\/(?:Authenticate(?:ByName|WithPolicy)?|Logout|ResetPassword|ForgotPassword)\b/i,
	/^\/Sessions\b/i,
	/^\/PlaybackInfo\b/i,
	/^\/Items\/[^/]+\/PlaybackInfo\b/i,
	/^\/Playback\b/i,
	/^\/PlayQueues\b/i,
	/^\/System\b/i,
	/^\/Security\b/i,
	/^\/Videos\/[^/]+\/(?:stream|original|download|file)\b/i,
	/^\/Videos\/[^/]+\/(?:master|main|live|subtitles)\.m3u8\b/i,
	/^\/Videos\/[^/]+\/hls1?\b/i,
	/^\/Videos\/ActiveEncodings\b/i,
	/^\/Audio\/[^/]+\/stream\b/i,
	/^\/Audio\/[^/]+\/(?:master|main)\.m3u8\b/i,
	/^\/Audio\/[^/]+\/hls1\b/i,
	/^\/Audio\/[^/]+\/universal(?:\.[^/]+)?\b/i,
	/^\/LiveTv\/(?:LiveRecordings|LiveStreamFiles)\/[^/]+\/stream(?:\.[^/]+)?\b/i,
	/^\/Items\/[^/]+\/download\b/i,
	/^\/Items\/[^/]+\/Images?/i,
	/^\/Images\b/i,
	/^\/Subtitle(?:s)?\b/i,
	/^\/web\b/i,
	/\/m3u8(?:\?|$)/i,
	/\/manifest(?:\?|$)/i,
	/\/transcod(?:\w*)/i
];
function normalizePrefix(value) {
	const prefix = String(value || "/emby").trim() || "/emby";
	const withSlash = prefix.startsWith("/") ? prefix : `/${prefix}`;
	return withSlash.replace(/\/+$/g, "") || "/";
}
function normalizePath(pathname) {
	const path = String(pathname || "/").replace(/\/{2,}/g, "/");
	return path.startsWith("/") ? path : `/${path}`;
}
function normalizeApiBasePath(pathname) {
	const path = normalizePath(pathname);
	if (path === "/") return "/";
	return path.replace(/\/+$/g, "") || "/";
}
function joinPath(left, right) {
	const a = normalizePath(left);
	const b = normalizePath(right);
	if (a === "/") return b;
	if (b === "/") return a;
	return `${a.replace(/\/+$/g, "")}/${b.replace(/^\/+/, "")}`;
}
function stripPrefix(pathname, prefix) {
	const path = normalizePath(pathname);
	const base = normalizePrefix(prefix);
	if (base === "/") return path;
	if (path === base) return "/";
	if (path.startsWith(`${base}/`)) return path.slice(base.length) || "/";
	return null;
}
function stripKnownBasePath(pathname, basePath) {
	const path = normalizePath(pathname);
	const normalizedBase = normalizeApiBasePath(basePath);
	if (normalizedBase === "/") return path;
	if (path === normalizedBase) return "/";
	if (path.startsWith(`${normalizedBase}/`)) return path.slice(normalizedBase.length) || "/";
	return path;
}
function stripApiBasePrefixes(pathname) {
	let path = normalizePath(pathname);
	let changed = true;
	while (changed && path !== "/") {
		changed = false;
		for (const prefix of API_BASE_PREFIXES) {
			const normalizedPrefix = normalizeApiBasePath(prefix);
			if (path === normalizedPrefix) {
				path = "/";
				break;
			}
			if (path.startsWith(`${normalizedPrefix}/`)) {
				path = path.slice(normalizedPrefix.length) || "/";
				changed = true;
				break;
			}
		}
	}
	return path;
}
function normalizeProxyTargetPath(pathname, upstreamBasePath) {
	let path = normalizePath(pathname);
	let changed = true;
	while (changed && path !== "/") {
		changed = false;
		const withoutUpstreamBase = stripKnownBasePath(path, upstreamBasePath);
		if (withoutUpstreamBase !== path) {
			path = withoutUpstreamBase;
			changed = true;
		}
		const withoutApiBase = stripApiBasePrefixes(path);
		if (withoutApiBase !== path) {
			path = withoutApiBase;
			changed = true;
		}
	}
	return path;
}
function normalizeRootUrl(value) {
	const raw = String(value || "").trim();
	if (!raw) return null;
	try {
		const normalized = raw.startsWith("http://") || raw.startsWith("https://")
			? raw
			: `https://${raw}`;
		const url = new URL(normalized);
		if (!/^https?:$/i.test(url.protocol)) return null;
		url.pathname = normalizeApiBasePath(url.pathname || "/");
		url.search = "";
		url.hash = "";
		return url;
	} catch {
		return null;
	}
}
function getConfiguredPublicOrigin() {
	const raw = String(CONFIG.PUBLIC_ORIGIN || "").trim();
	if (!raw) return null;
	try {
		const url = new URL(raw);
		url.pathname = "/";
		url.search = "";
		url.hash = "";
		return url;
	} catch {
		return null;
	}
}
function getPublicRequestUrl(request) {
	const original = new URL(request.url);
	const configured = getConfiguredPublicOrigin();
	if (configured) {
		return new URL(`${configured.origin}${original.pathname}${original.search}`);
	}
	const forwardedHost = String(
		request.headers.get("x-forwarded-host") ||
		request.headers.get("x-original-host") ||
		request.headers.get("x-host") ||
		request.headers.get("host") ||
		""
	).trim();
	const forwardedProto = String(
		request.headers.get("x-forwarded-proto") || original.protocol.replace(":", "")
	).trim().toLowerCase();
	if (forwardedHost) {
		const protocol =
			forwardedProto === "http" || forwardedProto === "https"
				? `${forwardedProto}:`
				: original.protocol;
		return new URL(`${protocol}//${forwardedHost}${original.pathname}${original.search}`);
	}
	return original;
}
function getExplicitOrDefaultPort(url) {
	return url.port || (url.protocol === "http:" ? "80" : url.protocol === "https:" ? "443" : "");
}
const _ABC=new Map();function buildAliasBasePath(alias){let v=_ABC.get(alias);if(v===undefined){v=joinPath(CONFIG.PROXY_PREFIX,alias);_ABC.set(alias,v)}return v}
function buildAliasProxyUrl(requestUrl, alias, path, search = "", hash = "") {
	const proxyUrl = new URL(requestUrl.origin);
	proxyUrl.pathname = joinPath(buildAliasBasePath(alias), normalizePath(path));
	proxyUrl.search = search;
	proxyUrl.hash = hash;
	return proxyUrl;
}
function canUsePrimaryAliasPath(targetUrl, backend) {
	if (targetUrl.origin !== backend.upstream.origin) return false;
	const basePath = normalizeApiBasePath(backend.upstream.pathname || "/");
	const targetPath = normalizePath(targetUrl.pathname || "/");
	if (basePath === "/") return true;
	return targetPath === basePath || targetPath.startsWith(`${basePath}/`);
}
function isAbsoluteHttpUrl(value) {
	return /^[a-z][a-z0-9+.-]*:\/\/?/i.test(String(value || "").trim());
}
function escapeRegExp(value) {
	return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function collapseDuplicatedAliasPrefixText(value, alias) {
	const text = String(value || "");
	const base = buildAliasBasePath(alias);
	const escapedBase = escapeRegExp(base);
	const rx = new RegExp(`${escapedBase}${escapedBase}(?=(?:/|\\?|#|$))`, "gi");
	let result = text;
	let previous = "";
	while (result !== previous) {
		previous = result;
		result = result.replace(rx, base);
	}
	return result;
}
function canHaveResponseBody(status) {
	return ![101, 204, 205, 304].includes(Number(status));
}
function isBypassPath(pathname, searchParams) {
	const path = normalizePath(pathname);
	if (BYPASS_CACHE_RX.some((rx) => rx.test(path))) return true;
	const sensitiveKeys = [
		"api_key",
		"apikey",
		"token",
		"access_token",
		"deviceid",
		"device_id",
		"userid",
		"user_id",
		"playsessionid",
		"sessionid",
		"session_id"
	];
	for (const key of sensitiveKeys) {
		if (searchParams.has(key)) return true;
	}
	return false;
}
function isStreamingPath(pathname, searchParams) {
	const path = normalizeProxyTargetPath(pathname, "/");
	if (STREAM_PATH_PATTERNS.some((rx) => rx.test(path))) return true;
	if (/\/(?:m3u8|mpd|manifest)(?:$|\/)/i.test(path)) return true;
	for (const [key, value] of searchParams.entries()) {
		const pair = `${key}=${value}`.toLowerCase();
		if (STREAM_QUERY_HINTS.some((hint) => pair.includes(hint))) return true;
	}
	return false;
}
function looksLikeRewriteableApiPathString(value) {
	const str = String(value || "").trim();
	if (!str.startsWith("/")) return false;
	return (
		str.startsWith("/emby") ||
		str.startsWith("/mediabrowser") ||
		str.startsWith("/Videos/") ||
		str.startsWith("/Audio/") ||
		str.startsWith("/Items/") ||
		str.startsWith("/Playback") ||
		str.startsWith("/PlaybackInfo") ||
		str.startsWith("/PlayQueues") ||
		str.startsWith("/LiveStreams") ||
		str.startsWith("/LiveTv/") ||
		str.startsWith("/Sessions") ||
		str.startsWith("/Users/") ||
		str.startsWith("/Images") ||
		str.startsWith("/web/") ||
		str.startsWith("/embywebsocket") ||
		str.startsWith("/socket")
	);
}
function buildForwardHeaders(request, upstreamUrl, publicRequestUrl) {
	const headers = new Headers(request.headers);
	const isWebSocket = String(headers.get("upgrade") || "").toLowerCase() === "websocket";
	for (const name of HOP_BY_HOP_HEADERS) {
		if (isWebSocket && (name === "connection" || name === "upgrade")) continue;
		headers.delete(name);
	}
	headers.delete("host");
	headers.delete("content-length");
	headers.delete("x-forwarded-prefix");
	if (!isWebSocket) {
		headers.delete("connection");
		headers.delete("upgrade");
	}
	const clientIp = request.headers.get("cf-connecting-ip");
	if (clientIp) {
		headers.set("x-real-ip", clientIp);
		headers.set("x-forwarded-for", clientIp);
	}
	headers.set("x-forwarded-host", publicRequestUrl.host);
	headers.set("x-forwarded-proto", publicRequestUrl.protocol.replace(":", ""));
	const authorization =
		headers.get("authorization") ||
		headers.get("x-emby-authorization") ||
		headers.get("x-mediabrowser-authorization");
	if (authorization) {
		headers.set("authorization", authorization);
		headers.set("x-emby-authorization", authorization);
		headers.set("x-mediabrowser-authorization", authorization);
	}
	const origin = headers.get("origin");
	if (origin) {
		try {
			const originUrl = new URL(origin);
			if (originUrl.origin !== upstreamUrl.origin) headers.set("origin", upstreamUrl.origin);
		} catch {
			headers.set("origin", upstreamUrl.origin);
		}
	}
	const referer = headers.get("referer");
	if (referer) {
		try {
			const refererUrl = new URL(referer);
			refererUrl.protocol = upstreamUrl.protocol;
			refererUrl.host = upstreamUrl.host;
			headers.set("referer", refererUrl.toString());
		} catch {
			headers.set("referer", upstreamUrl.origin + "/");
		}
	}
	return headers;
}
function buildCorsHeaders(request) {
	const origin = request.headers.get("Origin") || request.headers.get("origin") || "*";
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
		"Access-Control-Allow-Headers":
			request.headers.get("Access-Control-Request-Headers") || ACCESS_CONTROL_ALLOW_HEADERS,
		"Access-Control-Expose-Headers": ACCESS_CONTROL_EXPOSE_HEADERS,
		"Access-Control-Allow-Credentials": "true",
		"Access-Control-Max-Age": "86400"
	};
}
function buildNoStoreHeaders(headers) {
	headers.set("cache-control", "no-store, private, max-age=0");
}
function buildErrorResponse(message, status = 502) {
	return new Response(String(message || "Upstream request failed"), {
		status,
		headers: {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "no-store"
		}
	});
}
function getBackend(alias) {
	const raw = CONFIG.BACKENDS && CONFIG.BACKENDS[alias];
	if (!raw) return null;
	const upstream = normalizeRootUrl(raw.upstream);
	if (!upstream) return null;
	return { alias, upstream };
}
function normalizeAliasAndSegments(parts) {
	if (!parts.length) return { alias: "", rest: [] };
	let rawAlias = decodeURIComponent(parts[0] || "");
	let rest = parts.slice(1);
	if (getBackend(rawAlias)) {
		if (rest.length && (rest[0] === "emby" || rest[0] === "mediabrowser")) {
			rest = rest.slice(1);
		}
		return { alias: rawAlias, rest };
	}
	const aliasBeforeColon = rawAlias.split(":")[0];
	if (aliasBeforeColon && getBackend(aliasBeforeColon)) {
		rawAlias = aliasBeforeColon;
		if (rest.length && (rest[0] === "emby" || rest[0] === "mediabrowser")) {
			rest = rest.slice(1);
		}
		return { alias: rawAlias, rest };
	}
	return { alias: decodeURIComponent(parts[0] || ""), rest: parts.slice(1) };
}
function parseProxyRequest(pathname) {
	const rel = stripPrefix(pathname, CONFIG.PROXY_PREFIX);
	if (rel === null) return null;
	const clean = normalizePath(rel);
	const parts = clean.split("/").filter(Boolean);
	if (!parts.length) return { kind: "index" };
	const normalized = normalizeAliasAndSegments(parts);
	const alias = normalized.alias;
	const rest = normalized.rest;
	const backend = getBackend(alias);
	if (!backend) {
		return { kind: "unknown-backend", alias };
	}
	if (rest[0] === INTERNAL_DYNAMIC_SEGMENT) {
		const scheme = rest[1] || "";
		const host = rest[2] ? decodeURIComponent(rest[2]) : "";
		const port = rest[3] || "";
		const restParts = rest.slice(4);
		const dynamicPath = restParts.length ? `/${restParts.join("/")}` : "/";
		if (!/^https?$/.test(scheme) || !host || !/^\d+$/.test(port)) {
			return { kind: "invalid-dynamic", alias };
		}
		let dynamicRoot = null;
		try {
			dynamicRoot = new URL(`${scheme}://${host}:${port}`);
			dynamicRoot.pathname = "/";
			dynamicRoot.search = "";
			dynamicRoot.hash = "";
		} catch {
			return { kind: "invalid-dynamic", alias };
		}
		return {
			kind: "dynamic",
			alias,
			backend,
			targetRoot: dynamicRoot,
			targetPath: normalizePath(dynamicPath)
		};
	}
	const backendPath = rest.length ? `/${rest.join("/")}` : "/";
	return {
		kind: "backend",
		alias,
		backend,
		backendPath
	};
}
function buildIndexResponse() {
	const prefix = normalizePrefix(CONFIG.PROXY_PREFIX);
	const aliases = Object.keys(CONFIG.BACKENDS || {}).sort();
	return new Response(
		JSON.stringify(
			{
				ok: true,
				prefix,
				backends: aliases,
				examples: aliases.map((alias) => `${CONFIG.PUBLIC_ORIGIN || "https://your-domain.example"}${prefix}/${alias}`)
			},
			null,
			2
		),
		{
			status: 200,
			headers: {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "no-store"
			}
		}
	);
}
const TEXT_ENCODER = new TextEncoder();
let signingKeyPromise = null;
function getNowSeconds() {
	return Math.floor(Date.now() / 1000);
}
function getSigningKey() {
	if (!signingKeyPromise) {
		signingKeyPromise = crypto.subtle.importKey(
			"raw",
			TEXT_ENCODER.encode(String(CONFIG.SIGNING_SECRET || "")),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"]
		);
	}
	return signingKeyPromise;
}
const _HX=[];(function(){for(let i=0;i<256;i++)_HX[i]=i.toString(16).padStart(2,"0")})();function toHex(buffer){const B=new Uint8Array(buffer);let o="";for(let i=0;i<B.length;i++)o+=_HX[B[i]];return o}
function timingSafeEqual(a, b) {
	const left = String(a || "");
	const right = String(b || "");
	const max = Math.max(left.length, right.length);
	let diff = left.length ^ right.length;
	for (let i = 0; i < max; i += 1) {
		diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
	}
	return diff === 0;
}
function buildCanonicalQueryString(searchParams, omitKeys = []) {
	const omit = new Set(omitKeys.map((v) => String(v)));
	const pairs = [];
	for (const [key, value] of searchParams.entries()) {
		if (omit.has(key)) continue;
		pairs.push([key, value]);
	}
	pairs.sort((a, b) => {
		if (a[0] < b[0]) return -1;
		if (a[0] > b[0]) return 1;
		if (a[1] < b[1]) return -1;
		if (a[1] > b[1]) return 1;
		return 0;
	});
	return pairs
		.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
		.join("&");
}
function buildSignableUrlString(url, omitKeys = [SIGN_SIG_PARAM]) {
	const query = buildCanonicalQueryString(url.searchParams, omitKeys);
	return query ? `${url.origin}${url.pathname}?${query}` : `${url.origin}${url.pathname}`;
}
async function signUrl(url) {
	const key = await getSigningKey();
	const payload = buildSignableUrlString(url, [SIGN_SIG_PARAM]);
	const sig = await crypto.subtle.sign("HMAC", key, TEXT_ENCODER.encode(payload));
	return toHex(sig);
}
async function attachDynamicSignature(proxyUrl) {
	const url = new URL(proxyUrl.toString());
	const now = getNowSeconds();
	url.searchParams.delete(SIGN_TS_PARAM);
	url.searchParams.delete(SIGN_EXP_PARAM);
	url.searchParams.delete(SIGN_SIG_PARAM);
	url.searchParams.set(SIGN_TS_PARAM, String(now));
	url.searchParams.set(SIGN_EXP_PARAM, String(now + Number(CONFIG.SIGNING_TTL_SECONDS || 86400)));
	const sig = await signUrl(url);
	url.searchParams.set(SIGN_SIG_PARAM, sig);
	return url;
}
async function verifyDynamicRequestSignature(request) {
	const publicUrl = getPublicRequestUrl(request);
	const tsRaw = publicUrl.searchParams.get(SIGN_TS_PARAM);
	const expRaw = publicUrl.searchParams.get(SIGN_EXP_PARAM);
	const sigRaw = publicUrl.searchParams.get(SIGN_SIG_PARAM);
	if (!tsRaw || !expRaw || !sigRaw) {
		return {
			ok: false,
			status: 403,
			message: "Missing dynamic proxy signature"
		};
	}
	if (!/^\d+$/.test(tsRaw) || !/^\d+$/.test(expRaw)) {
		return {
			ok: false,
			status: 403,
			message: "Invalid dynamic proxy signature timestamp"
		};
	}
	const ts = Number(tsRaw);
	const exp = Number(expRaw);
	const now = getNowSeconds();
	const ttl = Number(CONFIG.SIGNING_TTL_SECONDS || 86400);
	const skew = Number(CONFIG.SIGNING_CLOCK_SKEW_SECONDS || 300);
	if (!Number.isFinite(ts) || !Number.isFinite(exp)) {
		return {
			ok: false,
			status: 403,
			message: "Invalid dynamic proxy signature timestamp"
		};
	}
	if (exp < ts) {
		return {
			ok: false,
			status: 403,
			message: "Invalid dynamic proxy signature window"
		};
	}
	if (exp - ts > ttl + skew) {
		return {
			ok: false,
			status: 403,
			message: "Dynamic proxy signature ttl exceeded"
		};
	}
	if (ts > now + skew) {
		return {
			ok: false,
			status: 403,
			message: "Dynamic proxy signature not yet valid"
		};
	}
	if (exp < now - skew) {
		return {
			ok: false,
			status: 403,
			message: "Dynamic proxy signature expired"
		};
	}
	const unsignedUrl = new URL(publicUrl.toString());
	unsignedUrl.searchParams.delete(SIGN_SIG_PARAM);
	const expected = await signUrl(unsignedUrl);
	if (!timingSafeEqual(sigRaw, expected)) {
		return {
			ok: false,
			status: 403,
			message: "Dynamic proxy signature mismatch"
		};
	}
	return {
		ok: true,
		publicUrl
	};
}
async function asyncReplace(input,regex,replacer){const source=String(input||"");const flags=regex.flags.includes("g")?regex.flags:`${regex.flags}g`;const rx=new RegExp(regex.source,flags);const C=[],P=[];let L=0,m;while((m=rx.exec(source))!==null){C.push(source.slice(L,m.index));P.push(replacer(m[0],m));L=m.index+m[0].length;if(m[0]==="")rx.lastIndex+=1}C.push(source.slice(L));const R=await Promise.all(P);let o=C[0];for(let i=0;i<R.length;i++)o+=R[i]+C[i+1];return o}
async function buildDynamicProxyUrl(requestUrl, alias, targetUrl) {
	const proxyUrl = new URL(requestUrl.origin);
	const scheme = targetUrl.protocol.replace(":", "");
	const host = encodeURIComponent(targetUrl.hostname);
	const port = getExplicitOrDefaultPort(targetUrl);
	const tailPath = normalizePath(targetUrl.pathname || "/");
	const prefix = normalizePrefix(CONFIG.PROXY_PREFIX).replace(/^\/+/, "");
	const pathParts = [prefix, encodeURIComponent(alias), INTERNAL_DYNAMIC_SEGMENT, scheme, host, port];
	if (tailPath !== "/") {
		pathParts.push(...tailPath.replace(/^\/+/, "").split("/").filter(Boolean));
	}
	proxyUrl.pathname = `/${pathParts.join("/")}`;
	proxyUrl.search = targetUrl.search;
	proxyUrl.hash = targetUrl.hash;
	return attachDynamicSignature(proxyUrl);
}
async function rewriteResolvedUrl(resolvedUrl, requestUrl, backend, options = {}) {
	const asPathOnly = Boolean(options.asPathOnly);
	const forceAbsolute = Boolean(options.forceAbsolute);
	const isStream = isStreamingPath(resolvedUrl.pathname, resolvedUrl.searchParams);
	let proxyUrl;
	if (canUsePrimaryAliasPath(resolvedUrl, backend)) {
		const relPath = normalizeProxyTargetPath(resolvedUrl.pathname, backend.upstream.pathname);
		proxyUrl = buildAliasProxyUrl(
			requestUrl,
			backend.alias,
			relPath,
			resolvedUrl.search,
			resolvedUrl.hash
		);
	} else {
		proxyUrl = await buildDynamicProxyUrl(requestUrl, backend.alias, resolvedUrl);
	}
	if (asPathOnly && !isStream && !forceAbsolute) {
		return proxyUrl.pathname + proxyUrl.search + proxyUrl.hash;
	}
	return proxyUrl.toString();
}
async function rewriteAnyUrlLike(value, requestUrl, backend, sourceBaseUrl, options = {}) {
	try {
		const raw = String(value || "");
		const resolved = new URL(raw, sourceBaseUrl);
		if (!/^https?:$/i.test(resolved.protocol)) return raw;
		return await rewriteResolvedUrl(resolved, requestUrl, backend, options);
	} catch {
		return String(value);
	}
}
function shouldRewriteJsonString(key, value) {
	const lowerKey = String(key || "").toLowerCase();
	const str = String(value || "");
	if (isAbsoluteHttpUrl(str)) return true;
	if (!str.startsWith("/")) return false;
	if (looksLikeRewriteableApiPathString(str)) return true;
	if (
		lowerKey.includes("url") ||
		lowerKey.endsWith("uri") ||
		lowerKey.includes("link") ||
		lowerKey === "path" ||
		lowerKey.endsWith("path")
	) {
		return looksLikeRewriteableApiPathString(str);
	}
	return false;
}
async function rewriteJsonObject(input, requestUrl, backend, sourceBaseUrl, parentKey = "") {
	if (Array.isArray(input)) {
		const out = [];
		for (const item of input) {
			out.push(await rewriteJsonObject(item, requestUrl, backend, sourceBaseUrl, parentKey));
		}
		return out;
	}
	if (input && typeof input === "object") {
		const out = {};
		for (const [key, value] of Object.entries(input)) {
			out[key] = await rewriteJsonObject(value, requestUrl, backend, sourceBaseUrl, key);
		}
		return out;
	}
	if (typeof input === "string") {
		if (!shouldRewriteJsonString(parentKey, input)) {
			return collapseDuplicatedAliasPrefixText(input, backend.alias);
		}
		return rewriteAnyUrlLike(input, requestUrl, backend, sourceBaseUrl, { asPathOnly: true });
	}
	return input;
}
async function rewritePlainText(text, requestUrl, backend, sourceBaseUrl) {
	const normalized = String(text || "").replace(/\\\//g, "/");
	const absMatches = [];
	const absRx = new RegExp(ABSOLUTE_URL_RX.source, ABSOLUTE_URL_RX.flags);
	let am;
	while ((am = absRx.exec(normalized)) !== null) absMatches.push(am[0]);
	const absoluteRewrites = await Promise.all(absMatches.map(u => rewriteAnyUrlLike(u, requestUrl, backend, sourceBaseUrl, { asPathOnly: true })));
	let idx = 0;
	const withAbsoluteTokens = normalized.replace(ABSOLUTE_URL_RX, () => `__EMBY_ABS_${idx++}__`);
	const withApiishRewrite = await asyncReplace(withAbsoluteTokens, APIISH_PATH_RX, async (match) => {
		if (match.includes("__EMBY_ABS_")) return match;
		return rewriteAnyUrlLike(match, requestUrl, backend, sourceBaseUrl, { asPathOnly: true });
	});
	const restored = withApiishRewrite.replace(ABS_TOKEN_RX, (token, idxText) => {
		const i = Number(idxText);
		return Number.isFinite(i) && absoluteRewrites[i] ? absoluteRewrites[i] : token;
	});
	return collapseDuplicatedAliasPrefixText(restored, backend.alias);
}
async function rewriteResponse(response, requestUrl, upstreamUrl, backend) {
	const headers = new Headers(response.headers);
	for (const name of HOP_BY_HOP_HEADERS) headers.delete(name);
	headers.delete("content-length");
	headers.delete("content-encoding");
	headers.delete("transfer-encoding");
	headers.delete("server");
	headers.delete("x-powered-by");
	headers.set("access-control-allow-origin", requestUrl.origin);
	headers.set("access-control-allow-credentials", "true");
	headers.set("access-control-expose-headers", ACCESS_CONTROL_EXPOSE_HEADERS);
	headers.set("vary", [headers.get("vary"), "Origin"].filter(Boolean).join(", "));
	const location = headers.get("location");
	if (location) {
		headers.set(
			"location",
			await rewriteAnyUrlLike(location, requestUrl, backend, upstreamUrl, {
				forceAbsolute: (Number(response.status) >= 300 && Number(response.status) < 400)
			})
		);
	}
	const contentLocation = headers.get("content-location");
	if (contentLocation) {
		headers.set(
			"content-location",
			await rewriteAnyUrlLike(contentLocation, requestUrl, backend, upstreamUrl, {
				forceAbsolute: true
			})
		);
	}
	const refresh = headers.get("refresh");
	if (refresh) {
		const rewrittenRefresh = await asyncReplace(
			String(refresh),
			/\burl\s*=\s*([^;]+)/i,
			async (match, fullMatch) => {
				const urlValue = fullMatch[1];
				const trimmed = String(urlValue || "").trim().replace(/^['"]|['"]$/g, "");
				const rewritten = await rewriteAnyUrlLike(trimmed, requestUrl, backend, upstreamUrl, {
					forceAbsolute: true
				});
				return `url=${rewritten}`;
			}
		);
		headers.set("refresh", rewrittenRefresh);
	}
	const setCookies = typeof response.headers.getSetCookie === "function"
		? response.headers.getSetCookie()
		: [];
	if (setCookies.length > 0) {
		headers.delete("set-cookie");
		for (const cookie of setCookies) {
			const parts = String(cookie || "").split(/;\s*/).filter(Boolean);
			if (!parts.length) continue;
			const rewritten = [parts[0]];
			let hasPath = false;
			for (let i = 1; i < parts.length; i += 1) {
				const part = parts[i];
				const lower = part.toLowerCase();
				if (lower.startsWith("domain=")) continue;
				if (lower.startsWith("path=")) {
					rewritten.push(`Path=${buildAliasBasePath(backend.alias)}`);
					hasPath = true;
					continue;
				}
				rewritten.push(part);
			}
			if (!hasPath) rewritten.push(`Path=${buildAliasBasePath(backend.alias)}`);
			headers.append("set-cookie", rewritten.join("; "));
		}
	}
	cacheCtrl(headers, upstreamUrl.pathname);
	if (!TEXT_TYPE_RX.test(response.headers.get("content-type") || "")) {
		return new Response(canHaveResponseBody(response.status) ? response.body : null, {
			status: response.status,
			statusText: response.statusText,
			headers
		});
	}
	if (!canHaveResponseBody(response.status)) {
		return new Response(null, {
			status: response.status,
			statusText: response.statusText,
			headers
		});
	}
	const contentType = headers.get("content-type") || "";
	const body = await response.text();
	if (JSON_TYPE_RX.test(contentType)) {
		try {
			const parsed = JSON.parse(body);
			const rewritten = await rewriteJsonObject(parsed, requestUrl, backend, upstreamUrl);
			return new Response(JSON.stringify(rewritten), {
				status: response.status,
				statusText: response.statusText,
				headers
			});
		} catch {
		}
	}
	return new Response(await rewritePlainText(body, requestUrl, backend, upstreamUrl), {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}
async function proxyParsedRequest(request, parsed) {
	let requestUrl;
	if (parsed.kind === "dynamic") {
		const verified = await verifyDynamicRequestSignature(request);
		if (!verified.ok) {
			return buildErrorResponse(verified.message, verified.status || 403);
		}
		requestUrl = verified.publicUrl;
	} else {
		requestUrl = getPublicRequestUrl(request);
	}
	const upstreamSearchParams = new URLSearchParams(requestUrl.search);
	if (parsed.kind === "dynamic") {
		upstreamSearchParams.delete(SIGN_TS_PARAM);
		upstreamSearchParams.delete(SIGN_EXP_PARAM);
		upstreamSearchParams.delete(SIGN_SIG_PARAM);
	}
	let upstreamRoot;
	let upstreamPath;
	if (parsed.kind === "dynamic") {
		upstreamRoot = parsed.targetRoot;
		upstreamPath = parsed.targetPath;
	} else {
		upstreamRoot = parsed.backend.upstream;
		upstreamPath = normalizeProxyTargetPath(parsed.backendPath, parsed.backend.upstream.pathname);
	}
	const upstreamUrl = new URL(upstreamRoot.toString());
	if (parsed.kind === "dynamic") {
		upstreamUrl.pathname = normalizePath(upstreamPath);
	} else {
		upstreamUrl.pathname = joinPath(upstreamRoot.pathname, upstreamPath);
	}
	upstreamUrl.search = upstreamSearchParams.toString();
	const init = {
		method: request.method,
		headers: buildForwardHeaders(request, upstreamUrl, requestUrl),
		redirect: "manual"
	};
	if (request.method !== "GET" && request.method !== "HEAD") {
		init.body = request.body;
	}
	let upstreamResponse;
	try {
		upstreamResponse = await fetch(upstreamUrl.toString(), init);
	} catch {
		return buildErrorResponse("Upstream request failed", 502);
	}
	// 流媒体直通 (零缓冲起播)
	if (!TEXT_TYPE_RX.test(upstreamResponse.headers.get("content-type") || "") && upstreamResponse.status < 300) {
		const sh = new Headers(upstreamResponse.headers);
		for (const n of HOP_BY_HOP_HEADERS) sh.delete(n);
		sh.delete("server"); sh.delete("x-powered-by");
		sh.set("access-control-allow-origin", requestUrl.origin);
		sh.set("access-control-allow-credentials", "true");
		sh.set("vary", [sh.get("vary"), "Origin"].filter(Boolean).join(", "));
		cacheCtrl(sh, upstreamUrl.pathname);
		return new Response(upstreamResponse.body, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: sh
		});
	}
	const response = await rewriteResponse(
		upstreamResponse,
		requestUrl,
		upstreamUrl,
		parsed.backend
	);
	const bypassPathForCache = parsed.kind === "dynamic" ? upstreamUrl.pathname : upstreamPath;
	if (isBypassPath(bypassPathForCache, upstreamSearchParams)) {
		const headers = new Headers(response.headers);
		buildNoStoreHeaders(headers);
		return new Response(canHaveResponseBody(response.status) ? response.body : null, {
			status: response.status,
			statusText: response.statusText,
			headers
		});
	}
	return response;
}
export default {
	async fetch(request) {
		try {
			const parsed = parseProxyRequest(new URL(request.url).pathname);
			if (request.method === "OPTIONS") {
				if (parsed !== null) {
					return new Response(null, {
						status: 204,
						headers: buildCorsHeaders(request)
					});
				}
				return fetch(request);
			}
			if (parsed === null) {
				return fetch(request);
			}
			if (parsed.kind === "index") {
				return fetch(request);
			}
			if (parsed.kind === "unknown-backend") {
				return buildErrorResponse(`Unknown backend alias: ${parsed.alias}`, 404);
			}
			if (parsed.kind === "invalid-dynamic") {
				return buildErrorResponse("Invalid dynamic upstream path", 400);
			}
			return await proxyParsedRequest(request, parsed);
		} catch (error) {
			const detail = error && error.message ? error.message : String(error);
			return buildErrorResponse(`Worker runtime exception: ${detail}`, 500);
		}
	}
};
