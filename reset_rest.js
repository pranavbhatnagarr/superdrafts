import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import fs from 'fs';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const slug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function loadStock() {
  const html = fs.readFileSync('./site/index.html', 'utf8');
  const match = html.match(/const STOCK = (\[[\s\S]*?\n\]);/);
  if (!match) throw new Error('Could not find STOCK array in site/index.html');
  return JSON.parse(match[1]);
}

const ANIME_UNIVERSES = ['NAR', 'JJK', 'DS', 'BC', 'SL'];

// --- AniList: strict exact-name match, with rate-limit backoff ---
async function fetchAniListImage(name, attempt = 1) {
  const query = `
    query ($search: String) {
      Character(search: $search) {
        name { full }
        image { large }
      }
    }
  `;
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { search: name } })
  });

  if (res.status === 429) {
    if (attempt > 3) return null;
    console.log(`  rate limited on "${name}", waiting 60s (attempt ${attempt})...`);
    await new Promise((r) => setTimeout(r, 60000));
    return fetchAniListImage(name, attempt + 1);
  }

  const data = await res.json();
  const char = data?.data?.Character;
  if (!char) return null;

  // AniList's search is fuzzy by default and can return an unrelated character.
  // Only trust it if the returned name reasonably matches what we searched for.
  const returnedName = char.name?.full?.toLowerCase() || '';
  const searched = name.toLowerCase();
  const nameMatches =
    returnedName === searched ||
    returnedName.includes(searched) ||
    searched.includes(returnedName.split(' ').pop()); // last name match, handles "Tanjiro Kamado" vs "Tanjirou Kamado"

  if (!nameMatches) {
    console.log(`  ⚠ "${name}" search returned "${char.name?.full}" — too different, skipping`);
    return null;
  }

  return char.image?.large || null;
}

// --- HP-API: fuzzy match on cached full character list ---
let hpCache = null;
async function fetchHPImage(name) {
  if (!hpCache) {
    const res = await fetch('https://hp-api.onrender.com/api/characters');
    hpCache = await res.json();
  }
  const target = name.toLowerCase();
  let found = hpCache.find((c) => c.name.toLowerCase() === target);
  if (!found) {
    found = hpCache.find(
      (c) =>
        c.name.toLowerCase().includes(target) ||
        c.name.toLowerCase().split(' ').includes(target.split(' ')[0])
    );
  }
  return found?.image || null;
}

async function uploadImage(sourceUrl, filename) {
  const imgRes = await fetch(sourceUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    }
  });
  if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`);
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const { error } = await supabase.storage
    .from('character-art')
    .upload(filename, buffer, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('character-art').getPublicUrl(filename);
  return data.publicUrl;
}

async function run() {
  const STOCK = loadStock();
  const rest = STOCK.filter(
    ([, universe]) => ANIME_UNIVERSES.includes(universe) || universe === 'HP'
  );
  console.log(`Found ${rest.length} anime/HP characters.\n`);

  // --- STEP 1: delete existing images for these characters ---
  const filenames = rest.map(([name]) => `${slug(name)}.jpg`);
  console.log(`Deleting ${filenames.length} old images from storage...`);
  const { error: deleteErr } = await supabase.storage.from('character-art').remove(filenames);
  if (deleteErr) console.log('Delete warning:', deleteErr.message);
  else console.log('Old images deleted.\n');

  // --- STEP 2: clear image_url in database ---
  for (const [name, universe] of rest) {
    await supabase.from('characters').update({ image_url: null }).eq('name', name).eq('universe', universe);
  }
  console.log('Cleared old image_url values.\n');

  // --- STEP 3: fetch fresh, strictly-matched images ---
  const stillMissing = [];
  let succeeded = 0;

  for (const [name, universe, alias, note, tier] of rest) {
    try {
      const rawUrl = ANIME_UNIVERSES.includes(universe)
        ? await fetchAniListImage(name)
        : await fetchHPImage(name);

      if (!rawUrl) {
        stillMissing.push({ name, universe, reason: 'no confident match found' });
        console.log(`✗ ${name} (${universe}) — no confident match`);
      } else {
        const image_url = await uploadImage(rawUrl, `${slug(name)}.jpg`);
        const { error } = await supabase
          .from('characters')
          .update({ image_url })
          .eq('name', name)
          .eq('universe', universe);
        if (error) throw error;
        succeeded++;
        console.log(`✓ ${name} (${universe})`);
      }
    } catch (err) {
      stillMissing.push({ name, universe, reason: err.message });
      console.log(`✗ ${name} (${universe}) — error: ${err.message}`);
    }

    // AniList's real limit is stricter than advertised — pace conservatively
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\nDone. ${succeeded}/${rest.length} succeeded with confident matches.`);
  if (stillMissing.length) {
    fs.writeFileSync('./needs-images-rest.json', JSON.stringify(stillMissing, null, 2));
    console.log(`${stillMissing.length} need manual images — see needs-images-rest.json:`);
    console.log(stillMissing.map((c) => c.name).join(', '));
  }
}

run();
