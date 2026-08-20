const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const code = blocks.find(b => b.includes('window.SaxeBrief ='));
if (!code) { console.error('SaxeBrief block not found'); process.exit(1); }
const win = {};
new Function('window', code)(win);
const B = win.SaxeBrief;
const splitReviews = B.splitReviews;

let pass = 0, fail = 0;
function eq(got, want, label){
  if (got === want) { pass++; }
  else { fail++; console.log(`  ✗ ${label}: got ${got}, want ${want}`); }
}
function ok(c, label){ if (c) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

// ---- original plain-text Amazon format (the knife set) --------------------------------------------
const amazonNoBlank =
`Jane D.
5.0 out of 5 stars Love this thing
Reviewed in the United States on January 3, 2024
Fits my small kitchen perfectly and cleans up in seconds.
Mark T.
4.0 out of 5 stars Good but heavy
Reviewed in the United States on February 11, 2024
Works great, just heavier than I expected.
Priya S.
5.0 out of 5 stars Would buy again
Reviewed in the United States on March 2, 2024
Best purchase this year, my whole family uses it.`;
eq(splitReviews(amazonNoBlank).length, 3, 'A: plain amazon 3 reviews, no blank lines, name preamble');

const amazonBlank =
`5.0 out of 5 stars Love this thing
Reviewed in the United States on January 3, 2024
Fits my small kitchen perfectly.

4.0 out of 5 stars Good but heavy
Reviewed in the United States on February 11, 2024
Works great, just heavier than expected.

5.0 out of 5 stars Would buy again
Reviewed in the United States on March 2, 2024
Best purchase this year.`;
eq(splitReviews(amazonBlank).length, 3, 'B: plain amazon 3 reviews with blank lines');

let big = '';
for (let i = 0; i < 30; i++){
  big += `Reviewer ${i}\n5.0 out of 5 stars Title ${i}\nReviewed in the United States on May ${i+1}, 2024\nBody text for review number ${i} goes here.\n`;
}
eq(splitReviews(big).length, 30, 'C: plain 30 reviews in one paste');

eq(splitReviews(`First review about the product.\n\nSecond review here.\n\nThird one.`).length, 3, 'D: plain blank-line separated');
eq(splitReviews('Just one review, nothing special.').length, 1, 'E: single review');
eq(splitReviews(`★★★★★ Amazing\nReally good product.\n★★★★ Solid\nWorks well enough.`).length, 2, 'F: unicode star glyphs, 2 reviews');
eq(splitReviews(`Reviewed in the United States on January 1, 2024 Great buy overall.\nReviewed in Canada on Feb 2, 2024 Happy with it.`).length, 2, 'G: reviewed-in fallback, 2 reviews');
eq(splitReviews('   \n  \n').length, 0, 'H: empty');

// ---- NEW: markdown-converted Amazon format (Shark WANDVAC, 20 reviews) ----------------------------
const md = fs.readFileSync(__dirname + '/fixtures/amazon2.txt', 'utf8');
const mdOut = splitReviews(md);
eq(mdOut.length, 20, 'MD: markdown Amazon paste splits into 20 reviews');
// chrome stripped + links unwrapped
ok(!mdOut.some(r => /\]\(https?:\/\//.test(r)), 'MD: markdown link syntax removed from every review');
ok(!mdOut.some(r => /^\s*Report\s*$/im.test(r)), 'MD: "Report" chrome line removed');
ok(!mdOut.some(r => /people found this helpful/i.test(r)), 'MD: "N people found this helpful" removed');
ok(!mdOut.some(r => /Translate (all )?reviews? to English/i.test(r)), 'MD: Translate line removed');
// each split review contains exactly one review header (no merges)
ok(mdOut.every(r => (r.match(/reviewed in\b.{0,60}?\bon\b/gi) || []).length <= 1), 'MD: no review contains 2+ "Reviewed in ... on" (clean split)');
// the long review stays whole (Dallas), the Spanish one is present
ok(mdOut.some(r => /HEPA/.test(r) && r.length > 800), 'MD: the long multi-paragraph review is one block, not fragmented');
ok(mdOut.some(r => /No es muy fuerte/.test(r)), 'MD: the Spanish review survives');
// suspectMergedCount: clean split => 0; a merged blob => >0
eq(B.suspectMergedCount(mdOut.map(f => ({ full: f }))), 0, 'MD: suspectMergedCount 0 on a good split');
eq(B.suspectMergedCount([{ full: md }]), 1, 'MD: whole unsplit paste flagged as merged (the failed-split signature)');

// ---- NEW: PLAIN-text Amazon paste (what actually lands in the textarea) ----------------------------
// Same 20 reviews, but no markdown link syntax: reviewer name on its own line, then "N out of 5 stars"
// plain, then "Reviewed in ... on". Exercises the star anchor + trailing-name boundary fix.
const plain = fs.readFileSync(__dirname + '/fixtures/amazon2_plain.txt', 'utf8');
const pOut = splitReviews(plain);
eq(pOut.length, 20, 'PLAIN: plain-text Amazon paste splits into 20 reviews');
// boundary fix: the giant Dallas review must NOT end with the next reviewer name "Beansssss"
const dallas = pOut.find(r => /HEPA/.test(r) && r.length > 800);
ok(dallas, 'PLAIN: Dallas review present and whole');
ok(dallas && !/Beansssss\s*$/.test(dallas), 'PLAIN: Dallas review does NOT end with the next reviewer name (boundary fixed)');
ok(pOut.some(r => /^Beansssss/.test(r)), 'PLAIN: "Beansssss" starts its own review, not trailing the previous one');
// clean split => nothing flagged as merged
eq(B.suspectMergedCount(pOut.map(f => ({ full: f }))), 0, 'PLAIN: no review flagged as merged after the boundary fix');
ok(pOut.some(r => /No es muy fuerte/.test(r)), 'PLAIN: the Spanish review survives');

// suspectMergedIndices names the offending row (1-based) and never throws on clean input
eq(JSON.stringify(B.suspectMergedIndices([{ full: 'a' }, { full: plain }, { full: 'b' }])), JSON.stringify([2]), 'suspectMergedIndices: names the merged row (1-based)');
eq(JSON.stringify(B.suspectMergedIndices(pOut.map(f => ({ full: f })))), JSON.stringify([]), 'suspectMergedIndices: empty on a clean split');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
