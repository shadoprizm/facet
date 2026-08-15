import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const seedDir = path.join(root, "scripts", "seed");
const publicSeedDir = path.join(root, "public", "seed");

const envPath = path.join(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

const personasCfg = JSON.parse(readFileSync(path.join(seedDir, "personas.json"), "utf8"));
const roomsCfg = JSON.parse(readFileSync(path.join(seedDir, "rooms.json"), "utf8"));

const demoHandles = ["aurora_polaris", "grumpy_badger"];
const demoSlugs = ["trailtalk"];
const personaBucket = "seed-persona-avatars";
const roomBucket = "seed-room-avatars";

function assetName(value) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function personaAvatarUrl(handle) {
  const { data } = db.storage.from(personaBucket).getPublicUrl(`${assetName(handle)}.svg`);
  return data.publicUrl;
}

function roomAvatarUrl(slug) {
  const { data } = db.storage.from(roomBucket).getPublicUrl(`${assetName(slug)}.svg`);
  return data.publicUrl;
}

async function ensureBucket(bucket) {
  const { data, error } = await db.storage.listBuckets();
  if (error) throw new Error(`list buckets: ${error.message}`);

  const options = {
    public: true,
    fileSizeLimit: 3 * 1024 * 1024,
    allowedMimeTypes: ["image/svg+xml"],
  };

  const exists = (data ?? []).some((candidate) => candidate.id === bucket);
  const { error: bucketError } = exists
    ? await db.storage.updateBucket(bucket, options)
    : await db.storage.createBucket(bucket, options);
  if (bucketError) throw new Error(`${exists ? "update" : "create"} bucket ${bucket}: ${bucketError.message}`);
}

async function uploadAssets(bucket, folder, names) {
  let uploaded = 0;
  for (const name of names) {
    const key = `${assetName(name)}.svg`;
    const file = path.join(publicSeedDir, folder, key);
    const { error } = await db.storage
      .from(bucket)
      .upload(key, readFileSync(file), {
        contentType: "image/svg+xml",
        cacheControl: "31536000",
        upsert: true,
      });
    if (error) throw new Error(`upload ${bucket}/${key}: ${error.message}`);
    uploaded++;
  }
  console.log(`${bucket}: ${uploaded} SVG assets uploaded.`);
}

async function updatePersonas() {
  const handles = [
    ...personasCfg.roots.flatMap((rootCfg) => rootCfg.facets.map((facet) => facet.handle.toLowerCase())),
    ...demoHandles,
  ];
  const { data, error } = await db
    .from("personas")
    .select("id, handle, avatar_url")
    .in("handle", handles);
  if (error) throw new Error(`read personas: ${error.message}`);

  let changed = 0;
  for (const row of data ?? []) {
    const wanted = personaAvatarUrl(row.handle);
    if (row.avatar_url === wanted) continue;
    const { error: updateError } = await db
      .from("personas")
      .update({ avatar_url: wanted })
      .eq("id", row.id);
    if (updateError) throw new Error(`update persona ${row.handle}: ${updateError.message}`);
    changed++;
  }
  console.log(`Persona avatars: ${changed} updated, ${(data ?? []).length} seed personas found.`);
}

async function updateRooms() {
  const slugs = [
    ...roomsCfg.rooms.map((room) => room.slug.toLowerCase()),
    ...demoSlugs,
  ];
  const { data, error } = await db
    .from("rooms")
    .select("id, slug, avatar_url")
    .in("slug", slugs);
  if (error) throw new Error(`read rooms: ${error.message}`);

  let changed = 0;
  for (const row of data ?? []) {
    const wanted = roomAvatarUrl(row.slug);
    if (row.avatar_url === wanted) continue;
    const { error: updateError } = await db
      .from("rooms")
      .update({ avatar_url: wanted })
      .eq("id", row.id);
    if (updateError) throw new Error(`update room ${row.slug}: ${updateError.message}`);
    changed++;
  }
  console.log(`Room images: ${changed} updated, ${(data ?? []).length} seed rooms found.`);
}

try {
  const handles = [
    ...personasCfg.roots.flatMap((rootCfg) => rootCfg.facets.map((facet) => facet.handle.toLowerCase())),
    ...demoHandles,
  ];
  const slugs = [
    ...roomsCfg.rooms.map((room) => room.slug.toLowerCase()),
    ...demoSlugs,
  ];
  await ensureBucket(personaBucket);
  await ensureBucket(roomBucket);
  await uploadAssets(personaBucket, "personas", handles);
  await uploadAssets(roomBucket, "rooms", slugs);
  await updatePersonas();
  await updateRooms();
} catch (error) {
  console.error(error);
  process.exit(1);
}
