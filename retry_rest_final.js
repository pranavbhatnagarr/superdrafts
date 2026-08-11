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

// These 11 are uniquely-named, famous characters — spelling/romanization
// mismatches (Tanjiro vs Tanjirou, Sung Jinwoo vs Sung Jin-Woo) tripped the
// strict matcher. Low collision risk, so we trust the top AniList result here.
async function fetchAniListTopResult(name, attempt = 1) {
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
    console.log(`  rate limited on "${name}", waiting 60s...`);
    await new Promise((r) => setTimeout(r, 60000));
    return fetchAniListTopResult(name, attempt + 1);
  }

  const data = await res.json();
  console.log(`  DEBUG raw response for "${name}":`, JSON.stringify(data));
  const char = data?.data?.Character;
  if (!char) return null;
  console.log(`  AniList matched "${name}" -> "${char.name?.full}" — verify this looks right`);
  return char.image?.large || null;
}

async function fetchHPTopResult(name) {
  const res = await fetch('https://hp-api.onrender.com/api/characters');
  const all = await res.json();
  const target = name.toLowerCase();
  const firstName = target.split(' ')[0];

  let found = all.find((c) => c.name.toLowerCase() === target);
  if (!found) found = all.find((c) => c.name.toLowerCase().includes(target));
  if (!found) found = all.find((c) => c.name.toLowerCase().includes(firstName));

  if (found) console.log(`  HP-API matched "${name}" -> "${found.name}" — verify this looks right`);
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
  const leftover = JSON.parse(fs.readFileSync('./needs-images-rest.json', 'utf8'));
  console.log(`Retrying final ${leftover.length} characters with relaxed matching...\n`);

  const stillMissing = [];
  let succeeded = 0;

  for (const { name, universe } of leftover) {
    try {
      const rawUrl =
        universe === 'HP' ? await fetchHPTopResult(name) : await fetchAniListTopResult(name);

      if (!rawUrl) {
        stillMissing.push({ name, universe, reason: 'still no match — needs manual sourcing' });
        console.log(`✗ ${name} (${universe}) — no match at all`);
      } else {
        const image_url = await uploadImage(rawUrl, `${slug(name)}.jpg`);
        const { error } = await supabase
          .from('characters')
          .update({ image_url })
          .eq('name', name)
          .eq('universe', universe);
        if (error) throw error;
        succeeded++;
        console.log(`✓ ${name} (${universe}) saved\n`);
      }
    } catch (err) {
      stillMissing.push({ name, universe, reason: err.message });
      console.log(`✗ ${name} (${universe}) — error: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\nDone. ${succeeded}/${leftover.length} recovered.`);
  if (stillMissing.length) {
    fs.writeFileSync('./needs-images-rest.json', JSON.stringify(stillMissing, null, 2));
    console.log(`${stillMissing.length} genuinely need manual images: ${stillMissing.map((c) => c.name).join(', ')}`);
  } else {
    fs.unlinkSync('./needs-images-rest.json');
    console.log('All recovered — needs-images-rest.json removed.');
  }
}

run();