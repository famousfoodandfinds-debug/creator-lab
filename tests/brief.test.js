const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const code = blocks.find(b => b.includes('window.SaxeBrief ='));
if (!code) { console.error('SaxeBrief block not found'); process.exit(1); }
const win = {};
new Function('window', code)(win);
const B = win.SaxeBrief;

let pass = 0, fail = 0;
function ok(c, m){ if(c) pass++; else { fail++; console.log('  ✗ ' + m); } }

// 1. derived brief is LIGHT (no raw); raw is a separate structure
const e = B.emptyBrief();
ok(e.v === 1 && !('raw' in e), 'derived brief holds no raw material');
ok(B.LINE_KEYS.length === 11, '11 checklist lines');
ok(Array.isArray(e.lines.pains) && Array.isArray(e.lines.objections), 'list lines are arrays');
ok(e.lines.who && e.lines.who.edited === false && Array.isArray(e.lines.who.words), 'single line shape');
const raw0 = B.emptyRaw();
ok(raw0.reviews.length === 0 && raw0.authorityRaw === '' && 'competitorComments' in raw0 && 'winningAngles' in raw0, 'raw material shape');
ok(JSON.stringify(B.mustHaveKeys()) === JSON.stringify(['who','emotion','desire','pains','problem']), 'must-have keys');

// 2. addReviews operates on RAW; no silent drop
let r = B.addReviews(B.emptyRaw(), [{full:'a'},{full:'b'},{full:'c'}], 2);
ok(r.added === 2 && r.rejected === 1 && r.atCap === true, 'cap: added 2, rejected 1, atCap (no silent drop)');
ok(r.added + r.rejected === 3, 'cap: nothing vanishes silently');
ok(B.reviewCount(r.raw) === 2, 'reviewCount reads raw');
let big = []; for(let i=0;i<120;i++) big.push({full:'r'+i});
let r2 = B.addReviews(B.emptyRaw(), big);
ok(r2.added === 100 && r2.rejected === 20, 'default cap 100');

// 3. chunkReviews
let ch = B.chunkReviews(big.slice(0,60), 25);
ok(ch.length === 3 && ch[0].length === 25 && ch[2].length === 10, 'chunk 60/25 -> 25,25,10');

// 4. edits lock a line
let b1 = B.editLine(e, 'who', { value: 'my hand-edited who' });
ok(b1.lines.who.value === 'my hand-edited who' && b1.lines.who.edited === true, 'editLine sets value + edited');
ok(Array.isArray(B.markEdited(e, 'pains', 0).lines.pains), 'markEdited on empty list is safe');

// 5. applyDerivation merge (derived brief only; total from derivation)
let d1 = { lines: { who: { value:'people cooking for a crowd', words:['counter space','feeding six'], count:9 },
                    emotion: { value:'overwhelmed at dinner', count:4 } },
           meta: { reviewCount: 34 } };
let m1 = B.applyDerivation(e, d1);
ok(m1.brief.lines.who.value === 'people cooking for a crowd', 'derivation fills who');
ok(m1.brief.lines.who.count === 9 && m1.brief.lines.who.total === 34, 'who count 9 of 34');
ok(m1.changes.some(c => c.key === 'who'), 'change logged for who');
ok(m1.brief.meta.reviewCount === 34, 'meta.reviewCount = derivation total');

// 5b. edited line preserved
let edited = B.editLine(e, 'who', { value: 'KEEP ME' });
let m2 = B.applyDerivation(edited, d1);
ok(m2.brief.lines.who.value === 'KEEP ME' && m2.brief.lines.who.edited === true, 'edited line never overwritten');
ok(!m2.changes.some(c => c.key === 'who'), 'no change logged for preserved edited line');

// 5c. list line merge: kept edited + added new, dup-of-kept skipped, non-edited replaced
let base = B.emptyBrief();
base.lines.pains = [ { value:'wont fit my oven', words:[], claims:[], count:2, total:10, edited:true },
                     { value:'old auto-derived pain', words:[], claims:[], count:1, total:10, edited:false } ];
let dPains = { lines: { pains: [ { value:'wont fit my oven', count:9 },
                                  { value:'too heavy to lift', count:5 } ] }, meta: { reviewCount: 34 } };
let m3 = B.applyDerivation(base, dPains);
let pv = m3.brief.lines.pains.map(p => p.value);
ok(pv.includes('wont fit my oven') && pv.includes('too heavy to lift'), 'list: kept edited + added new');
ok(!pv.includes('old auto-derived pain'), 'list: non-edited old item replaced');
ok(pv.filter(v => v === 'wont fit my oven').length === 1, 'list: no duplicate of kept item');
ok(m3.brief.lines.pains.find(p=>p.value==='too heavy to lift').total === 34, 'list: added item total set');

// 6. evidence honesty: denominator = the total the count was measured against (line.total)
let hb = B.emptyBrief(); hb.meta.reviewCount = 34;
hb.lines.who = { value:'x', words:[], claims:[], count:9, total:34, edited:false };
ok(B.evidence(hb, hb.lines.who).total === 34, 'evidence total = derivation total (34), not a live raw count');
let hb2 = B.emptyBrief(); hb2.meta.reviewCount = 20;
ok(B.evidence(hb2, { count:3 }).total === 20, 'evidence falls back to meta.reviewCount');

// 7. compliance separation
let clx = { value:'v', words:['cozy','feels like home'], claims:['cured my back pain'], count:1, total:1 };
ok(JSON.stringify(B.safeWords(clx)) === JSON.stringify(['cozy','feels like home']), 'safeWords = buyer language');
ok(JSON.stringify(B.claims(clx)) === JSON.stringify(['cured my back pain']), 'claims separated');

// 8. isThin uses derivation review count
ok(B.isThin(hb) === false, '34 reviews not thin');
ok(B.isThin(B.emptyBrief()) === true, '0 reviews thin');

// 9. normalize coerces junk (brief + raw)
let junkB = B.normalizeBrief({ lines: { who: 'nope', pains: 'nope' }, features: 7 });
ok(junkB.lines.who.value === '' && Array.isArray(junkB.lines.pains) && Array.isArray(junkB.features), 'normalizeBrief coerces bad shapes');
let junkR = B.normalizeRaw({ reviews: 'nope', winningAngles: null, description: 42 });
ok(Array.isArray(junkR.reviews) && Array.isArray(junkR.winningAngles) && junkR.description === '42', 'normalizeRaw coerces bad shapes');

// 9b. mergeChunkDerivations: counts sum across chunks; total = stored reviews
let c1 = { lines: { who: { value:'busy parents', words:['no time'], count:5 },
                    pains: [ { value:'too loud', words:['wakes baby'], count:3 },
                             { value:'hard to clean', count:2 } ] },
           features: [ { feature:'timer', benefit:'walk away' } ] };
let c2 = { lines: { who: { value:'Busy Parents', words:['juggling kids'], count:4 },
                    pains: [ { value:'too loud', claims:['broke in a week'], count:6 },
                             { value:'too big', count:1 } ] },
           features: [ { feature:'timer', benefit:'ignored dup' }, { feature:'quiet mode', benefit:'sleeps' } ] };
let mc = B.mergeChunkDerivations([c1, c2], 50);
ok(mc.lines.who.value === 'busy parents' && mc.lines.who.count === 9, 'merge: single line sums count across chunks (5+4=9)');
ok(mc.lines.who.total === 50 && mc.meta.reviewCount === 50, 'merge: total = stored review count');
ok(mc.lines.who.words.length === 2, 'merge: single line unions words');
let loud = mc.lines.pains.find(p => p.value === 'too loud');
ok(loud && loud.count === 9, 'merge: list finding dedupes + sums (3+6=9)');
ok(loud.words.includes('wakes baby') && loud.claims.includes('broke in a week'), 'merge: list finding unions words+claims');
ok(mc.lines.pains[0].value === 'too loud', 'merge: list sorted by count desc');
ok(mc.lines.pains.length === 3, 'merge: distinct list findings kept (loud, clean, big)');
ok(mc.features.length === 2 && mc.features[0].benefit === 'walk away', 'merge: features dedupe by name, first benefit wins');
let mcEmpty = B.mergeChunkDerivations([], 0);
ok(mcEmpty.lines.who.value === '' && Array.isArray(mcEmpty.lines.pains), 'merge: empty input -> empty derived shape');
// merged object feeds applyDerivation cleanly
let am = B.applyDerivation(B.emptyBrief(), mc);
ok(am.brief.lines.who.count === 9 && am.brief.lines.who.total === 50, 'merge -> applyDerivation carries counts');

// 9c. applyClusters: semantic merge sums member counts (capped at total), drops non-members, keeps forgotten
let clItems = [
  { value:'dull knives', count:3, words:['blunt'] },
  { value:'knives get dull fast', count:3, words:['dull fast'] },
  { value:'blades go blunt', count:2, claims:['ruined my knife'] },
  { value:'not enough counter space', count:4 },
  { value:'takes counter room', count:1 },
  { value:'intrigued me enough to try', count:1 }   // positive, will be dropped
];
let clSpec = { groups: [ { value:'knives go dull', members:[0,1,2] }, { value:'takes up counter space', members:[3,4] } ], dropped:[5] };
let clr = B.applyClusters(clItems, clSpec, 22);
let dull = clr.find(x => x.value === 'knives go dull');
ok(dull && dull.count === 8, 'clusters: dull-knife variants summed 3+3+2=8');
ok(dull.words.includes('blunt') && dull.words.includes('dull fast') && dull.claims.includes('ruined my knife'), 'clusters: words+claims unioned');
ok(dull.total === 22, 'clusters: total carried');
let csx = clr.find(x => x.value === 'takes up counter space');
ok(csx && csx.count === 5, 'clusters: counter-space variants summed 4+1=5');
ok(!clr.some(x => x.value === 'intrigued me enough to try'), 'clusters: dropped positive removed');
ok(clr[0].value === 'knives go dull', 'clusters: sorted by count desc');
ok(clr.length === 2, 'clusters: two consolidated findings');
// cap at total + keep-forgotten safety
let capItems = [ {value:'a', count:15}, {value:'b', count:15}, {value:'c', count:2} ];
let capSpec = { groups:[ {value:'ab', members:[0,1]} ], dropped:[] };  // index 2 forgotten
let capped = B.applyClusters(capItems, capSpec, 20);
ok(capped.find(x=>x.value==='ab').count === 20, 'clusters: summed count capped at total (30->20)');
ok(capped.some(x=>x.value==='c'), 'clusters: forgotten item kept, never lost');

// 9d. countInReviews: deterministic, whole-word, case/punct-insensitive, stable
let revs = [ {full:'My knives went DULL fast!'}, {full:'the blades are blunt now'}, {full:'great product, love it'},
             {full:'not enough counter space in my kitchen'}, {full:'dull within a week'} ];
ok(B.countInReviews(['dull','blunt'], revs) === 3, 'count: dull|blunt found in 3 reviews');
ok(B.countInReviews(['dull'], revs) === 2, 'count: dull in 2');
ok(B.countInReviews(['space'], [{full:'aerospace parts'}]) === 0, 'count: whole-word, aerospace != space');
ok(B.countInReviews(['space'], [{full:'more space please'}]) === 1, 'count: whole-word space matches');
ok(B.countInReviews([], revs) === 0, 'count: no phrases -> 0');
ok(B.countInReviews(['a','of'], revs) === 0, 'count: sub-3-char phrases ignored');
ok(B.countInReviews(['dull fast'], revs) === 1, 'count: multiword phrase matches consecutively');
ok(B.countInReviews(['dull'], ['My knives went dull','all good']) === 1, 'count: accepts plain strings too');
// stable + overwrites model estimate
let mergedD = { lines: { emotion: { value:'frustrated', words:['dull'], count:99 },
                         pains: [ { value:'knives go dull', words:['dull','blunt'], count:5 } ] } };
let rc1 = B.recountFindings(JSON.parse(JSON.stringify(mergedD)), revs);
let rc2 = B.recountFindings(JSON.parse(JSON.stringify(mergedD)), revs);
ok(rc1.lines.pains[0].count === 3 && rc1.lines.pains[0].total === 5, 'recount: pain count from reviews (3 of 5), model estimate discarded');
ok(rc1.lines.emotion.count === 2, 'recount: single line recounted (dull in 2)');
ok(rc1.lines.pains[0].count === rc2.lines.pains[0].count, 'recount: stable across runs');
ok(rc1.meta.reviewCount === 5, 'recount: meta total = review count');

// 9e. incremental: newReviews / markReviewsDerived
let rawInc = B.emptyRaw();
rawInc.reviews = [ {full:'a', derived:true}, {full:'b'}, {full:'c', derived:true}, {full:'d'} ];
ok(B.newReviews(rawInc).length === 2, 'incremental: newReviews = undived only (b,d)');
let markedRaw = B.markReviewsDerived(rawInc);
ok(B.newReviews(markedRaw).length === 0, 'incremental: markReviewsDerived flags all');
ok(B.normalizeRaw(rawInc).reviews[0].derived === true && B.normalizeRaw(rawInc).reviews[1].derived === false, 'incremental: derived flag persists through normalizeRaw');

// 9f. mergeIncremental keeps existing values, unions phrases, appends new list findings, preserves edits
let baseB = B.emptyBrief();
baseB.lines.who = { value:'busy parents', words:['no time'], claims:[], count:5, total:20, edited:false };
baseB.lines.emotion = { value:'KEEP EDIT', words:[], claims:[], count:0, total:20, edited:true };
baseB.lines.pains = [ { value:'too loud', words:['loud'], claims:[], count:3, total:20, edited:false } ];
let newDer = { lines: { who: { value:'different who', words:['juggling'], count:9 },
                        emotion: { value:'overwritten?', words:['x'], count:9 },
                        pains: [ { value:'too loud', words:['noisy'], count:2 }, { value:'hard to clean', words:['messy'], count:1 } ] } };
let mi = B.mergeIncremental(baseB, newDer, { now: '2026-08-20T00:00:00Z' });
ok(mi.lines.who.value === 'busy parents', 'incremental: existing single value kept (stability)');
ok(mi.lines.who.words.indexOf('juggling') >= 0 && mi.lines.who.words.indexOf('no time') >= 0, 'incremental: new phrases unioned into kept line');
ok(mi.lines.emotion.value === 'KEEP EDIT' && mi.lines.emotion.edited === true, 'incremental: hand-edited line untouched');
let miPainVals = mi.lines.pains.map(p => p.value);
ok(miPainVals.indexOf('too loud') >= 0 && miPainVals.indexOf('hard to clean') >= 0, 'incremental: existing kept + new pain appended');
ok(mi.lines.pains.filter(p => p.value === 'too loud').length === 1, 'incremental: exact-dup pain folded, not duplicated');
ok(mi.lines.pains.find(p => p.value === 'too loud').words.indexOf('noisy') >= 0, 'incremental: dup pain unions phrases');
ok(mi.meta.lastDerivedAt === '2026-08-20T00:00:00Z', 'incremental: lastDerivedAt set');
// empty single line gets filled
let baseB2 = B.emptyBrief();
let mi2 = B.mergeIncremental(baseB2, { lines: { who: { value:'new who', words:['w'] } } });
ok(mi2.lines.who.value === 'new who', 'incremental: empty single line filled by new derivation');

// 9g. recount verifies phrases: no chip survives that is not in the reviews; count 0 => no phrases
let vReviews = [ {full:'my knives went dull fast'}, {full:'blades are blunt'} ];
let vMerged = { lines: { pains: [ { value:'knives go dull', words:['dull','unicorn glitter'], claims:['ruined my life'] } ],
                         who: { value:'x', words:['nonexistent phrase'], claims:[] } } };
B.recountFindings(vMerged, vReviews);
ok(vMerged.lines.pains[0].words.indexOf('dull') >= 0 && vMerged.lines.pains[0].words.indexOf('unicorn glitter') < 0, 'recount: unverified phrase pruned, real one kept');
ok(vMerged.lines.pains[0].claims.length === 0, 'recount: unverified claim pruned');
ok(vMerged.lines.pains[0].count === 1, 'recount: count = reviews with a verified phrase');
ok(vMerged.lines.who.words.length === 0 && vMerged.lines.who.count === 0, 'recount: line with no real phrase => 0 count, no chips (no self-contradiction)');

// 9h. terms: count the concept across paraphrases, unioned through merge + incremental
let reviewsT = [ {full:'the battery only lasts 10 minutes'}, {full:'charge dies so fast'}, {full:'run time is short'}, {full:'love the suction'} ];
let mT = { lines: { pains: [ { value:'battery life', words:['battery'], terms:['battery','charge','run time','minutes'] } ] } };
B.recountFindings(mT, reviewsT);
ok(mT.lines.pains[0].count === 3, 'terms: battery concept counted across paraphrases (3 of 4), not 1');
let tc1 = { lines: { pains: [ { value:'battery', terms:['battery','charge'] } ] } };
let tc2 = { lines: { pains: [ { value:'battery', terms:['run time','dies'] } ] } };
let tm = B.mergeChunkDerivations([tc1, tc2], 20);
ok(tm.lines.pains[0].terms.length === 4, 'terms: unioned across chunks');
let baseT = B.emptyBrief(); baseT.lines.pains = [ { value:'battery', words:[], claims:[], terms:['battery'], count:0, total:0, edited:false } ];
let miT = B.mergeIncremental(baseT, { lines: { pains: [ { value:'battery', terms:['charge','run time'] } ] } });
ok(miT.lines.pains[0].terms.indexOf('charge') >= 0 && miT.lines.pains[0].terms.indexOf('battery') >= 0, 'terms: incremental unions terms into kept finding');
ok(B.emptyBrief().lines.who.terms && Array.isArray(B.emptyBrief().lines.who.terms), 'terms: present in the line shape');

// 9i. applyUnifiedClusters: a concept in BOTH lists collapses to ONE category (no pain/objection dup)
let uPains = [ { value:'battery dies fast', terms:['battery','dies'], count:5 }, { value:'filter clogs', terms:['filter','clog'], count:4 } ];
let uObjs  = [ { value:'worried battery wont last', terms:['battery','last'], count:2 }, { value:'is it worth the price', terms:['price','worth'], count:1 } ];
let uSpec = { clusters: [ { value:'battery life', category:'pain', members:[0,2] }, { value:'filter clogging', category:'pain', members:[1] }, { value:'price worth it', category:'objection', members:[3] } ], dropped:[] };
let u = B.applyUnifiedClusters(uPains, uObjs, uSpec, 20);
let allP = u.pains.map(p=>p.value), allO = u.objections.map(o=>o.value);
ok(allP.includes('battery life') && !allO.includes('battery life'), 'unified: battery collapses to ONE category, not both');
ok(u.pains.find(p=>p.value==='battery life').terms.indexOf('last') >= 0, 'unified: merged cluster unions terms from both lists');
ok(u.pains.find(p=>p.value==='battery life').count === 7, 'unified: merged cluster sums counts across lists (5+2)');
ok(allP.includes('filter clogging') && allO.includes('price worth it'), 'unified: other concepts placed in their category');
ok(u.pains.length === 2 && u.objections.length === 1, 'unified: nothing duplicated across the two lists');
let u2 = B.applyUnifiedClusters([{value:'a',terms:['a']}], [{value:'b',terms:['b']}], { clusters:[], dropped:[] }, 10);
ok(u2.pains.length===1 && u2.objections.length===1, 'unified: forgotten items kept in their original list');

// 9j. a product WITH reviews but NO brief yet must yield a fully valid, renderable empty brief
// (every prior test assumed a brief exists; this is the new-product empty state that was blank).
let noBriefProduct = { id:'p1', raw:{ reviews:[{full:'battery dies fast'},{full:'filter clogs'}] }, brief:null };
let nb = B.getBrief(noBriefProduct);
ok(nb && nb.meta, 'empty state: getBrief on a no-brief product returns a brief with meta (no throw on brief.meta)');
ok(nb.meta.lastDerivedAt === null, 'empty state: not derived (button should read Build brief)');
ok(B.LINE_KEYS.every(k => nb.lines[k.key] !== undefined), 'empty state: all 11 lines present');
ok(B.isThin(nb) === true, 'empty state: isThin true, does not throw');
// the exact accesses renderBrief makes on an empty brief must not throw
let renderSafe = true;
try {
  void (!!nb.meta.lastDerivedAt);
  void (nb.meta.reviewCount | 0);
  B.mustHaveKeys().forEach(k => { let ln = nb.lines[k]; if (Array.isArray(ln)) ln.forEach(x => { B.evidence(nb, x); B.safeWords(x); B.claims(x); }); else { B.evidence(nb, ln); B.safeWords(ln); B.claims(ln); } });
} catch(e){ renderSafe = false; }
ok(renderSafe, 'empty state: every brief access renderBrief makes is safe on a no-brief product');

// 9k. sentiment-aware counting via classified hits
ok(typeof B.reviewHash === 'function' && B.reviewHash('abc') === B.reviewHash('abc'), 'reviewHash: deterministic');
ok(B.reviewHash('abc') !== B.reviewHash('abd'), 'reviewHash: differs by content');
let ridRaw = B.normalizeRaw({ reviews:[{full:'sharpener works great'},{full:'sharpener never sharpens'}] });
ok(ridRaw.reviews[0].id && ridRaw.reviews[0].id !== ridRaw.reviews[1].id, 'normReview: stable distinct ids');
ok('hits' in B.emptyBrief().lines.who && Array.isArray(B.emptyBrief().lines.who.hits), 'line shape: hits array present');
// recount: classified => count from hits (sentiment), not keyword topic
let idA = B.reviewHash('sharpener works great'), idB = B.reviewHash('sharpener never sharpens'), idC = B.reviewHash('love the block');
let clsReviews = [ {id:idA, full:'sharpener works great'}, {id:idB, full:'sharpener never sharpens'}, {id:idC, full:'love the block'} ];
let clsBrief = B.emptyBrief();
clsBrief.lines.objections = [ { value:'sharpener does not work', words:[], claims:[], terms:['sharpener'], hits:[idB], count:0, total:0, edited:false } ];
clsBrief.meta.classified = true;
B.recountFindings(clsBrief, clsReviews);
ok(clsBrief.lines.objections[0].count === 1, 'recount(classified): counts only the sentiment-matching review (1, not 2 by keyword)');
ok(clsBrief.lines.objections[0].total === 3, 'recount(classified): total = stored reviews');
// removing the hit review drops the count deterministically
B.recountFindings(clsBrief, [ {id:idA, full:'sharpener works great'}, {id:idC, full:'love the block'} ]);
ok(clsBrief.lines.objections[0].count === 0, 'recount(classified): removed review drops the hit');
// not-classified brief falls back to keyword terms (backward compatible)
let fbBrief = B.emptyBrief(); fbBrief.lines.pains = [ { value:'x', words:[], claims:[], terms:['sharpener'], hits:[], count:0, total:0, edited:false } ];
B.recountFindings(fbBrief, clsReviews);
ok(fbBrief.lines.pains[0].count === 2, 'recount(unclassified): falls back to keyword terms (2)');
// applyHits sets hits + flips classified
let ahBrief = B.emptyBrief();
ahBrief.lines.pains = [ { value:'battery dies', words:[], claims:[], terms:[], hits:[], count:0, total:0, edited:false } ];
ahBrief.lines.who = { value:'busy parents', words:[], claims:[], terms:[], hits:[], count:0, total:0, edited:false };
B.applyHits(ahBrief, { pains:[{ value:'battery dies', hits:['r1','r2'] }], who:{ hits:['r1'] } });
ok(ahBrief.lines.pains[0].hits.length === 2 && ahBrief.lines.who.hits.length === 1, 'applyHits: hits assigned by value/key');
ok(ahBrief.meta.classified === true, 'applyHits: flips meta.classified');
// hits + classified survive normalizeBrief (persist through load)
let rt = B.normalizeBrief(JSON.parse(JSON.stringify(ahBrief)));
ok(rt.meta.classified === true && rt.lines.pains[0].hits.length === 2, 'normalizeBrief: hits + classified round-trip');

// 9l. consolidation carries hits through the merge (the broad merged pain must not come back empty)
let hcPains = [
  { value:'knives lose sharpness quickly', words:[], claims:[], terms:[], hits:['ra','rb','rc'], count:0, total:0, edited:false },
  { value:'blades go dull fast',            words:[], claims:[], terms:[], hits:['rc','rd'],      count:0, total:0, edited:false },
  { value:'block feels cheap',              words:[], claims:[], terms:[], hits:['re'],           count:0, total:0, edited:false }
];
// cluster the two dullness findings (indices 0,1) into one; leave 2 alone
let hcSpec = { clusters: [ { value:'knives lose sharpness quickly', category:'pain', members:[0,1] }, { value:'block feels cheap', category:'pain', members:[2] } ], dropped:[] };
let hcU = B.applyUnifiedClusters(hcPains, [], hcSpec, 22);
let hcDull = hcU.pains.find(p => p.value === 'knives lose sharpness quickly');
ok(hcDull, 'merge-hits: merged dullness pain present');
ok(hcDull.hits.slice().sort().join(',') === 'ra,rb,rc,rd', 'merge-hits: merged finding has the UNION of member hits (ra,rb,rc,rd), deduped');
// and once classified, its count reflects the unioned hits
let hcBrief = B.emptyBrief(); hcBrief.lines.pains = hcU.pains; hcBrief.meta.classified = true;
let hcReviews = ['ra','rb','rc','rd','re','rf'].map(function(id){ return { id:id, full:'x' }; });
B.recountFindings(hcBrief, hcReviews);
ok(hcBrief.lines.pains.find(p=>p.value==='knives lose sharpness quickly').count === 4, 'merge-hits: merged pain counts 4 from unioned hits, not 0');
// applyClusters (single-list) also unions hits
let acItems = [ {value:'a', hits:['r1','r2']}, {value:'b', hits:['r2','r3']} ];
let acOut = B.applyClusters(acItems, { groups:[{value:'ab', members:[0,1]}], dropped:[] }, 10);
ok(acOut[0].hits.slice().sort().join(',') === 'r1,r2,r3', 'applyClusters: unions member hits');

// 10. storage glue reads dedicated columns
let prod = { brief: m3.brief, raw: r.raw };
ok(B.getBrief(prod).lines.pains.length === m3.brief.lines.pains.length, 'getBrief reads .brief column');
ok(B.reviewCount(B.getRaw(prod)) === 2, 'getRaw reads .raw column');

// 11. materialSig: comments are tracked as derived material, so new comments trigger a rebuild.
ok(B.materialSig('') === '' && B.materialSig('   \n ') === '', 'materialSig: blank text has no signature');
ok(B.materialSig('too pricey for what it is') === B.materialSig('too pricey  for   what it is'), 'materialSig: whitespace-insensitive (stable across trivial edits)');
ok(B.materialSig('too pricey') !== B.materialSig('runs out of battery'), 'materialSig: different content -> different signature');
ok(B.materialSig('a') !== '', 'materialSig: real text -> a signature (not empty)');
// the exact predicate deriveBrief uses to decide "comments are new material"
let cmBrief = B.emptyBrief();                         // fresh brief has never read any comments
ok(cmBrief.meta.commentsHash === '', 'commentsHash: empty on a never-derived brief');
let noComments = B.materialSig('') !== (cmBrief.meta.commentsHash || '');
ok(noComments === false, 'decision: no comments + never-read -> NOT changed (no needless rebuild)');
let addedComments = B.materialSig('too pricey for a knife') !== (cmBrief.meta.commentsHash || '');
ok(addedComments === true, 'decision: pasting comments into a built brief counts as new material (rebuild)');
// after a build stamps the signature, the SAME comments no longer count as new
cmBrief.meta.commentsHash = B.materialSig('too pricey for a knife');
ok((B.materialSig('too pricey for a knife') !== cmBrief.meta.commentsHash) === false, 'decision: unchanged comments do NOT rebuild after being read');
ok((B.materialSig('too pricey for a knife\nalso rusts') !== cmBrief.meta.commentsHash) === true, 'decision: editing/adding to the comments counts as new again');
// commentsHash survives a storage round-trip (so the tracking is not lost on reload)
ok(B.normalizeBrief({ meta: { commentsHash: 'mabc' } }).meta.commentsHash === 'mabc', 'commentsHash: preserved through normalizeBrief (persists across loads)');

// 12. classification-stability plumbing: the `classified` finding flag and meta.classifiedIds are what let
// incremental classification leave SETTLED (review x finding) hits untouched instead of re-rolling them.
ok(B.emptyBrief().meta.classifiedIds.length === 0 && B.emptyBrief().meta.classified === false, 'new brief: no reviews classified yet');
ok(Array.isArray(B.normalizeBrief({ meta: { classifiedIds: ['ra','rb'] } }).meta.classifiedIds) &&
   B.normalizeBrief({ meta: { classifiedIds: ['ra','rb'] } }).meta.classifiedIds.join(',') === 'ra,rb',
   'classifiedIds: preserved through normalizeBrief (incremental state survives reload)');
ok(B.emptyBrief().lines.who.classified === false, 'finding starts unclassified');
ok(B.normalizeBrief({ lines: { who: { value:'busy parents', classified:true } } }).lines.who.classified === true,
   'classified flag: preserved through normalizeBrief');
// a settled finding merged in consolidation stays classified (so it is not re-judged next build)
let cfsItems = [ {value:'rusts', hits:['r1'], count:1, classified:true}, {value:'goes rusty', hits:['r2'], count:1, classified:true} ];
let cfsOut = B.applyClusters(cfsItems, { groups:[{value:'rusts', members:[0,1]}], dropped:[] }, 10);
ok(cfsOut[0].classified === true, 'applyClusters: merged finding keeps classified=true');
ok(cfsOut[0].hits.slice().sort().join(',') === 'r1,r2', 'applyClusters: merged finding keeps unioned hits');
// a NEW (unclassified) finding merged with a settled one marks the survivor classified (OR of members)
let cfsMix = B.applyClusters([ {value:'a', classified:true, hits:['r1']}, {value:'a2', classified:false, hits:[]} ],
   { groups:[{value:'a', members:[0,1]}], dropped:[] }, 10);
ok(cfsMix[0].classified === true, 'applyClusters: survivor is classified if ANY member was');
// unified clusters carry the flag across the pain/objection split too
let cfsUc = B.applyUnifiedClusters([{value:'dulls fast', hits:['r1'], count:1, classified:true}], [], { clusters:[{value:'dulls fast', category:'pain', members:[0]}], dropped:[] }, 10);
ok(cfsUc.pains[0].classified === true, 'applyUnifiedClusters: carries classified through');
// mergeIncremental: a settled list finding keeps its hits AND classified when the same value comes back empty
let cfsBase = B.emptyBrief(); cfsBase.lines.pains = [ B.normalizeBrief({lines:{pains:[{value:'dulls fast', hits:['r1','r2'], count:2, classified:true}]}}).lines.pains[0] ];
let cfsMerged = B.mergeIncremental(cfsBase, { lines: { pains: [{ value:'dulls fast', words:['dull'] }] } }, {});
ok(cfsMerged.lines.pains.length === 1, 'mergeIncremental: duplicate value does not create a second finding');
ok(cfsMerged.lines.pains[0].classified === true && cfsMerged.lines.pains[0].hits.slice().sort().join(',') === 'r1,r2',
   'mergeIncremental: settled finding keeps its classified flag and hits when re-extracted');

// 13. INCREMENTAL classification stability -- the core guarantee: once a (finding, item) pair is judged it
// is never re-judged, so counts on untouched findings cannot move across builds even if the model would
// answer differently. simClassify replays exactly what the DOM driver does with the pure plan.
function simClassify(brief, items, ch, model){
  let plan = B.classifyPlan(brief, items, ch);
  plan.passes.forEach(function(pass){
    pass.items.forEach(function(it){
      (model(it, pass.findings) || []).forEach(function(n){ B.addHit(pass.findings[n], it.id, ch); });
    });
  });
  B.classifyFinalize(brief, items, ch);
  brief.meta.classified = true;   // driver flips this so recount counts from hits
}
let sbrief = B.emptyBrief();
sbrief.lines.who = B.normalizeBrief({ lines: { who: { value: 'busy parents' } } }).lines.who;
sbrief.lines.pains = [ B.normalizeBrief({ lines: { pains: [{ value: 'dulls fast' }] } }).lines.pains[0] ];
let sreviews = ['r1','r2','r3','r4'].map(function(id){ return { id: id, full: id }; });
// build 1: who expressed by r1,r2 ; dulls by r1,r2,r3
simClassify(sbrief, sreviews, B.CH_REVIEW, function(it, finds){
  let whoI = finds.findIndex(f => f.value === 'busy parents'), dullI = finds.findIndex(f => f.value === 'dulls fast');
  let out = [];
  if (['r1','r2'].indexOf(it.id) >= 0 && whoI >= 0) out.push(whoI);
  if (['r1','r2','r3'].indexOf(it.id) >= 0 && dullI >= 0) out.push(dullI);
  return out;
});
B.recountFindings(sbrief, sreviews, []);
let whoCount1 = sbrief.lines.who.count, dullCount1 = sbrief.lines.pains[0].count;
ok(whoCount1 === 2, 'stability: build 1 who = 2');
ok(dullCount1 === 3, 'stability: build 1 dulls = 3');
// build 2: a NEW pain 'rusts' arrives (as comments would add). An ADVERSARIAL model that, IF asked, would
// answer who/dulls completely differently -- proving settled findings are simply never re-asked.
sbrief.lines.pains.push(B.normalizeBrief({ lines: { pains: [{ value: 'rusts' }] } }).lines.pains[0]);
simClassify(sbrief, sreviews, B.CH_REVIEW, function(it, finds){
  let whoI = finds.findIndex(f => f.value === 'busy parents'), dullI = finds.findIndex(f => f.value === 'dulls fast'), rustI = finds.findIndex(f => f.value === 'rusts');
  let out = [];
  if (whoI >= 0) out.push(whoI);     // would claim ALL 4 reviews express who -- must be ignored
  if (dullI >= 0) out.push(dullI);   // ditto for dulls
  if (rustI >= 0 && ['r4'].indexOf(it.id) >= 0) out.push(rustI);
  return out;
});
B.recountFindings(sbrief, sreviews, []);
ok(sbrief.lines.who.count === whoCount1, 'stability: who count UNCHANGED after new finding added (was ' + whoCount1 + ', now ' + sbrief.lines.who.count + ')');
ok(sbrief.lines.pains.find(p=>p.value==='dulls fast').count === dullCount1, 'stability: dulls count UNCHANGED after new finding added');
ok(sbrief.lines.pains.find(p=>p.value==='rusts').count === 1, 'stability: the NEW finding gets its own count (rusts = 1)');
// build 3: nothing new at all -> plan has no passes -> pure recount, still identical
let plan3 = B.classifyPlan(sbrief, sreviews, B.CH_REVIEW);
ok(plan3.passes.length === 0, 'stability: build 3 with nothing new needs ZERO model passes');
B.recountFindings(sbrief, sreviews, []);
ok(sbrief.lines.who.count === whoCount1 && sbrief.lines.pains.find(p=>p.value==='dulls fast').count === dullCount1, 'stability: counts identical on a no-op rebuild');

// 14. comment channel: separate evidence from people who have not bought yet
ok(B.splitComments('too pricey\n\n  colours dont match  \ntoo pricey').length === 2, 'splitComments: trims, drops blanks, dedupes');
let cmts = B.splitComments('the colours dont match my kitchen at all\nis the product info even accurate\nlooks cheap in person');
let cobj = B.emptyBrief();
cobj.lines.objections = [ B.normalizeBrief({ lines: { objections: [{ value: 'colours do not match' }] } }).lines.objections[0] ];
simClassify(cobj, cmts, B.CH_COMMENT, function(it, finds){
  let ci = finds.findIndex(f => f.value === 'colours do not match');
  return (/colours/.test(it.text) && ci >= 0) ? [ci] : [];
});
B.recountFindings(cobj, [], cmts);
let cObjLine = cobj.lines.objections[0];
ok(cObjLine.ccount === 1 && cObjLine.ctotal === 3, 'comments: objection raised in 1 of 3 comments');
ok(cObjLine.cwords.length === 1 && /colours dont match/.test(cObjLine.cwords[0]), 'comments: commenter own words captured as chips');
ok(cObjLine.count === 0, 'comments: review count stays 0 (kept separate from comment count)');
// comment classification is ALSO incremental: re-running with the same comments needs no passes
ok(B.classifyPlan(cobj, cmts, B.CH_COMMENT).passes.length === 0, 'comments: settled comment classification is not re-judged');
// review and comment channels are independent: classifying comments did not set review classifiedIds
ok(B.classifyPlan(cobj, [{id:'rx',full:'x'}], B.CH_REVIEW).full === true, 'channels: comment classification leaves the review channel untouched');

// 15. hand-editing the brief (Phase 4): wording is editable; counts and chips are not.
let he = B.emptyBrief();
he.lines.who = B.normalizeBrief({ lines: { who: { value: 'derived who', hits: ['r1','r2'], count: 2, classified: true } } }).lines.who;
let he2 = B.editLine(he, 'who', { value: 'my who' });
ok(he2.lines.who.value === 'my who' && he2.lines.who.edited === true, 'editLine: sets value + edited');
ok(he2.lines.who.derivedValue === 'derived who', 'editLine: snapshots the derived wording for revert');
ok(he2.lines.who.count === 2 && he2.lines.who.hits.join(',') === 'r1,r2', 'editLine: editing wording does NOT change count or hits');
let he3 = B.editLine(he2, 'who', { value: 'my who again' });
ok(he3.lines.who.derivedValue === 'derived who', 'editLine: a second edit keeps the ORIGINAL derived snapshot');
let he4 = B.revertLine(he3, 'who');
ok(he4.lines.who.value === 'derived who' && he4.lines.who.edited === false, 'revertLine: restores derived wording and unlocks the line');
// clearing a single line sticks -- an edited empty line is never refilled by a rebuild
let hc = B.editLine(he, 'who', { value: '' });
ok(hc.lines.who.value === '' && hc.lines.who.edited === true, 'clear: empty value + edited');
let hcR = B.mergeIncremental(hc, { lines: { who: { value: 'FRESH DERIVED' } } }, {});
ok(hcR.lines.who.value === '' && hcR.lines.who.edited === true, 'clear: a rebuild does NOT refill a deliberately cleared line');
ok(hcR.lines.who.derivedValue === 'derived who', 'clear: the revert snapshot survives the rebuild');
let heR = B.mergeIncremental(he2, { lines: { who: { value: 'FRESH' } } }, {});
ok(heR.lines.who.value === 'my who' && heR.lines.who.derivedValue === 'derived who', 'edit: edited value AND snapshot both survive a rebuild');

// list add / delete / revert
let la = B.emptyBrief();
la.lines.objections = [ B.normalizeBrief({ lines: { objections: [{ value: 'derived obj', hits: ['r1'], count: 1, classified: true }] } }).lines.objections[0] ];
let la2 = B.addListItem(la, 'objections', 'colours do not match my set');
ok(la2.lines.objections.length === 2, 'addListItem: appends the line');
ok(la2.lines.objections[1].added === true && la2.lines.objections[1].edited === true && la2.lines.objections[1].count === 0, 'addListItem: marked mine, locked, no count');
ok(B.flatFindings(la2).some(f => f.value === 'derived obj') && !B.flatFindings(la2).some(f => f.value === 'colours do not match my set'), 'flatFindings: added lines are excluded from classification (never get a review count)');
la2.meta.classified = true;
B.recountFindings(la2, [{ id: 'r1', full: 'x' }], []);
ok(la2.lines.objections[1].count === 0, 'recount: an added line stays at count 0');
ok(la2.lines.objections[0].count === 1, 'recount: the derived line keeps its real count');
ok(B.deleteListItem(la2, 'objections', 0).lines.objections.length === 1, 'deleteListItem: removes the named item');
ok(B.revertLine(la2, 'objections', 1).lines.objections.length === 1, 'revertLine: an added line is removed (nothing derived to fall back to)');
let laRev = B.emptyBrief();
laRev.lines.pains = [ B.normalizeBrief({ lines: { pains: [{ value: 'edited pain', derivedValue: 'original pain', edited: true, hits: ['r1'], count: 1 }] } }).lines.pains[0] ];
ok(B.revertLine(laRev, 'pains', 0).lines.pains[0].value === 'original pain', 'revertLine: an edited list item goes back to its derived wording');

// 16. consolidation shield: a locked (edited/added) list line survives a merge that would drop it
let pEdited = B.normalizeBrief({ lines: { pains: [{ value: 'my edited pain', hits: ['r1'], count: 1, classified: true, edited: true }] } }).lines.pains[0];
let pFree   = B.normalizeBrief({ lines: { pains: [{ value: 'derived pain', hits: ['r2'], count: 1, classified: true }] } }).lines.pains[0];
let clustered = B.applyUnifiedClusters([pFree], [], { clusters: [], dropped: [0] }, 5);   // model drops the free pain
let recombined = [pEdited].concat(clustered.pains);
ok(recombined.length === 1 && recombined[0].value === 'my edited pain', 'shield: the merge can drop a derived pain, but the edited one is held out of its reach');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
