import { put, list } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
/**
 * Single-user JSON persistence with two backends behind the same
 * readJson/writeJson interface, so every caller (api/*.ts, server.ts)
 * stays unchanged regardless of which backend is active:
 *
 * - Vercel Blob, used automatically when BLOB_READ_WRITE_TOKEN is set
 *   (i.e. deployed on Vercel with a Blob store attached).
 * - Local JSON files on disk under .local-data/, used automatically
 *   when that token is absent (local `npm run start:web` runs), since
 *   Blob needs real network access and a token that isn't always
 *   convenient to have configured for local development.
 *
 * Vercel Blob has no direct "get by key" API: `put()` returns a URL,
 * and to read a value back we `list()` by prefix to find that URL,
 * then fetch it. Writes use `allowOverwrite: true` so the same key
 * always maps to the same logical value instead of accumulating new
 * blobs per save.
 */
const USE_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const LOCAL_DATA_ROOT = new URL("../.local-data/", import.meta.url).pathname;
function localPathForKey(key) {
    // Keys look like "job-scout/profile.json" — mirror that as a real path.
    return join(LOCAL_DATA_ROOT, key);
}
async function readLocalJson(key) {
    try {
        const text = await readFile(localPathForKey(key), "utf8");
        return JSON.parse(text);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        throw error;
    }
}
async function writeLocalJson(key, data) {
    const path = localPathForKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(data, null, 2), "utf8");
}
async function findBlobUrl(key) {
    const { blobs } = await list({ prefix: key, limit: 1 });
    const match = blobs.find((b) => b.pathname === key);
    return match ? match.url : null;
}
async function readBlobJson(key) {
    const url = await findBlobUrl(key);
    if (!url)
        return null;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok)
        return null;
    return (await response.json());
}
async function writeBlobJson(key, data) {
    await put(key, JSON.stringify(data, null, 2), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
    });
}
export async function readJson(key) {
    return USE_BLOB ? readBlobJson(key) : readLocalJson(key);
}
export async function writeJson(key, data) {
    return USE_BLOB ? writeBlobJson(key, data) : writeLocalJson(key, data);
}
// Stable storage keys. Single-user for this milestone, so no user-id prefix.
export const STORAGE_KEYS = {
    profile: "job-scout/profile.json",
    cv: "job-scout/cv.json",
    savedJobs: "job-scout/saved-jobs.json",
    tailoredCvs: "job-scout/tailored-cvs.json",
};
