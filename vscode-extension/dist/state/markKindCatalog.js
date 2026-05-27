"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FALLBACK_BUILTIN_CATALOG = void 0;
exports.getMarkKindCatalogSnapshot = getMarkKindCatalogSnapshot;
exports.getMarkKindAccentByKindMap = getMarkKindAccentByKindMap;
exports.setMarkKindCatalogRows = setMarkKindCatalogRows;
exports.enabledMarkKindsSorted = enabledMarkKindsSorted;
exports.glyphForStructuredKind = glyphForStructuredKind;
exports.gutterIconFileForStructuredKind = gutterIconFileForStructuredKind;
exports.gutterIconForKind = gutterIconForKind;
exports.gutterColoredDotSvgDataUri = gutterColoredDotSvgDataUri;
exports.hexToRgbWithAlpha = hexToRgbWithAlpha;
exports.refreshMarkKindCatalogFromApi = refreshMarkKindCatalogFromApi;
exports.FALLBACK_BUILTIN_CATALOG = [
    { kind_key: "NOTE", display_label: "Mark", enabled: true, sort_order: 0, color: "#475569", is_builtin: true },
    { kind_key: "SOURCE", display_label: "Source", enabled: true, sort_order: 10, color: "#15803d", is_builtin: true },
    { kind_key: "SINK", display_label: "Sink", enabled: true, sort_order: 20, color: "#b91c1c", is_builtin: true },
    { kind_key: "GUARD", display_label: "Guard", enabled: true, sort_order: 30, color: "#1d4ed8", is_builtin: true },
    { kind_key: "TRANSFORM", display_label: "Transform", enabled: true, sort_order: 40, color: "#a16207", is_builtin: true },
];
let catalogEntries = [...exports.FALLBACK_BUILTIN_CATALOG];
function getMarkKindCatalogSnapshot() {
    return catalogEntries;
}
/** Uppercased kind_key → hex color; for embedding in Webview config */
function getMarkKindAccentByKindMap() {
    const acc = {};
    for (const row of catalogEntries) {
        acc[row.kind_key.toUpperCase()] = row.color;
    }
    return acc;
}
function setMarkKindCatalogRows(entries) {
    catalogEntries = entries.length ? [...entries] : [...exports.FALLBACK_BUILTIN_CATALOG];
}
function enabledMarkKindsSorted() {
    return [...catalogEntries]
        .filter((row) => row.enabled)
        .sort((a, b) => a.sort_order - b.sort_order || a.kind_key.localeCompare(b.kind_key));
}
/** Letter shown inside gutter rail caps for builtin structural kinds */
function glyphForStructuredKind(kindKey) {
    const key = kindKey.toUpperCase();
    switch (key) {
        case "SOURCE":
            return "S";
        case "SINK":
            return "K";
        case "GUARD":
            return "G";
        case "TRANSFORM":
            return "T";
        case "CHECK":
            return "C";
        case "NOTE":
            return null;
        default:
            return null;
    }
}
/** Filenames under `media/` for structural kinds only; NOTE/custom kinds use tinted gutter dot */
function gutterIconFileForStructuredKind(kindKey) {
    const key = kindKey.toUpperCase();
    switch (key) {
        case "SOURCE":
            return "source.svg";
        case "SINK":
            return "sink.svg";
        case "GUARD":
            return "guard.svg";
        case "TRANSFORM":
            return "transform.svg";
        default:
            return null;
    }
}
/** @deprecated use gutterIconFileForStructuredKind — kept for any external imports */
function gutterIconForKind(kindKey) {
    return gutterIconFileForStructuredKind(kindKey) ?? "mark.svg";
}
function gutterColoredDotSvgDataUri(hex) {
    const raw = hex.trim();
    const withHash = /^#/.test(raw) ? raw : `#${raw}`;
    const safeHex = /^#[0-9A-Fa-f]{6}$/.test(withHash) ? withHash : "#475569";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="${safeHex}"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function hexToRgbWithAlpha(hex, alpha) {
    const normalized = hex.trim().replace("#", "");
    if (normalized.length !== 6) {
        return `rgba(71,85,105,${alpha})`;
    }
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}
async function refreshMarkKindCatalogFromApi(api) {
    try {
        const resolved = await api.resolveIds();
        const data = await api.getMarkKindCatalog(resolved.assessmentId);
        const rows = Array.isArray(data.entries) ? data.entries : [];
        if (rows.length) {
            setMarkKindCatalogRows(rows.map((entry) => ({
                id: entry.id,
                kind_key: entry.kind_key,
                display_label: entry.display_label,
                enabled: entry.enabled,
                sort_order: entry.sort_order,
                color: entry.color,
                is_builtin: entry.is_builtin,
            })));
        }
    }
    catch {
        /* keep previous / fallback catalog */
    }
}
