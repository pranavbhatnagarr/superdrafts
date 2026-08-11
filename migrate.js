import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import fs from 'fs';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const COMICVINE_KEY = process.env.COMICVINE_API_KEY;

const slug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function loadStock() {
  const html = fs.readFileSync('./site/index.html', 'utf8');
  const match = html.match(/const STOCK = (\[[\s\S]*?\n\]);/);
  if (!match) throw new Error('Could not find STOCK array in site/index.html');
  return JSON.parse(match[1]);
}

const PUBLISHER_ID = { MAR: 31, DC: 10 };

async function fetchComicVineImage(name, universe, attempt = 1) {
  const url = `https://comicvine.gamespot.com/api/search/?api_key=${COMICVINE_KEY}&format=json&resources=character&query=${encodeURIComponent(name)}&limit=10&field_list=name,image,publisher`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CoverPriceGame/1.0 (personal project)' }
  });

  if (res.status === 420 || res.status === 429) {
    if (attempt > 3) throw new Error('rate limited, gave up after 3 retries');
    const waitSec = 90;
    console.log(`  rate limited on "${name}", waiting ${waitSec}s (attempt ${attempt})...`);
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    return fetchComicVineImage(name, universe, attempt + 1);
  }

  const data = await res.json();
  if (data.status_code && data.status_code !== 1) {
    throw new Error(`Comic Vine error: ${data.error || data.status_code}`);
  }

  const results = data.results || [];
  const wantedPubId = PUBLISHER_ID[universe];

  // Strict: exact name AND correct publisher only. No fallback to wrong-publisher matches
  // (this is what caused Loki to get a non-Marvel image before).
  let match = results.find(
    (r) =>
      r.name?.toLowerCase() === name.toLowerCase() &&
      r.publisher?.id === wantedPubId
  );
  if (!match) {
    match = results.find((r) => r.publisher?.id === wantedPubId);
  }

  if (!match) return null; // no fallback — better to flag as missing than save a wrong image
  return match.image?.medium_url || match.image?.small_url || null;
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
  const marvelDC = STOCK.filter(([, universe]) => universe === 'MAR' || universe === 'DC');
  console.log(`Found ${marvelDC.length} Marvel/DC characters.`);

  // --- STEP 1: delete existing Marvel/DC images from storage ---
  const filenames = marvelDC.map(([name]) => `${slug(name)}.jpg`);
  console.log(`Deleting ${filenames.length} old images from storage...`);
  const { error: deleteErr } = await supabase.storage
    .from('character-art')
    .remove(filenames);
  if (deleteErr) {
    console.log('Delete warning (some may not have existed):', deleteErr.message);
  } else {
    console.log('Old images deleted.');
  }

  // --- STEP 2: clear image_url in the database for these rows ---
  for (const [name, universe] of marvelDC) {
    await supabase
      .from('characters')
      .update({ image_url: null })
      .eq('name', name)
      .eq('universe', universe);
  }
  console.log('Cleared old image_url values in database.\n');

  // --- STEP 3: fetch fresh, correctly-matched images ---
  const stillMissing = [];
  let succeeded = 0;

  for (const [name, universe, alias, note, tier] of marvelDC) {
    try {
      const rawUrl = await fetchComicVineImage(name, universe);

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

    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\nDone. ${succeeded}/${marvelDC.length} succeeded with confident matches.`);
  if (stillMissing.length) {
    fs.writeFileSync('./needs-images-comicvine.json', JSON.stringify(stillMissing, null, 2));
    console.log(`${stillMissing.length} need manual images — see needs-images-comicvine.json:`);
    console.log(stillMissing.map((c) => c.name).join(', '));
  }
}

run();