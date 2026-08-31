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

// 9b-2. mergeChunkDerivations preserves the CLASSIFICATION fields (about/cause/need) -- the fold used to
// rebuild each finding without them, so the derived brief lost every label and every pain defaulted to
// "product" (nothing could open a script). First non-empty label wins when chunks disagree on emptiness.
let lc1 = { lines: { pains: [ { value:'trays never keep up', count:3, about:'alternative', need:'convenience' },
                              { value:'first batch is watery', count:2 } ],   // unlabelled in this chunk
                     objections: [ { value:'cubes look hollow', count:4 } ] } };   // no cause here
let lc2 = { lines: { pains: [ { value:'trays never keep up', count:2 },        // same pain, no label this chunk
                              { value:'first batch is watery', count:1, about:'product', need:'safety' } ],
                     objections: [ { value:'cubes look hollow', count:3, cause:'the mold cavity is oversized' } ] } };
let lm = B.mergeChunkDerivations([lc1, lc2], 30);
let alt = lm.lines.pains.find(p => p.value === 'trays never keep up');
ok(alt && alt.about === 'alternative' && alt.need === 'convenience', 'merge: carries about+need from the chunk that had them (survives an unlabelled duplicate)');
ok(alt.count === 5, 'merge: labelled finding still sums counts across chunks (3+2=5)');
let prodPain = lm.lines.pains.find(p => p.value === 'first batch is watery');
ok(prodPain && prodPain.about === 'product' && prodPain.need === 'safety', 'merge: carries a label that only appears in the SECOND chunk');
let hollow = lm.lines.objections.find(o => o.value === 'cubes look hollow');
ok(hollow && hollow.cause === 'the mold cavity is oversized', 'merge: carries the objection cause across chunks');
// resolve (the action that answers an objection) rides through the same paths as cause -- normalize, merge,
// both cluster helpers, and the gen adapter -- so generation can SHOW the action without naming the doubt.
ok(B.normalizeBrief({lines:{objections:[{value:'worried about mold',resolve:'rinse with vinegar and water'}]}}).lines.objections[0].resolve === 'rinse with vinegar and water', 'normalize: objection resolve round-trips');
let ro1 = { lines: { objections: [ { value:'worried about mold', count:3, resolve:'rinse with vinegar and water' } ] } };
let ro2 = { lines: { objections: [ { value:'worried about mold', count:2 } ] } };
let rmerge = B.mergeChunkDerivations([ro1, ro2], 20);
ok(rmerge.lines.objections[0].resolve === 'rinse with vinegar and water' && rmerge.lines.objections[0].count === 5, 'merge: carries objection resolve across chunks and still sums count');
let roClust = B.applyClusters([{ value:'mold worry', count:2, resolve:'rinse it out' }, { value:'mildew worry', count:1 }], { groups:[{ value:'mold', members:[0,1] }], dropped:[] }, 10);
ok(roClust[0].resolve === 'rinse it out', 'applyClusters: representative carries the first resolving action');
let roUni = B.applyUnifiedClusters([], [{ value:'mold worry', count:2, resolve:'rinse it out' }], { clusters:[{ value:'mold', category:'objection', members:[0] }], dropped:[] }, 10);
ok(roUni.objections[0].resolve === 'rinse it out', 'applyUnifiedClusters: objection carries the resolving action');
ok(B.briefToGenContext(B.normalizeBrief({lines:{objections:[{value:'worried about mold',resolve:'rinse with vinegar and water'}]}}), B.emptyRaw()).objections[0].resolve === 'rinse with vinegar and water', 'adapter: exposes objection resolve to generation');

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

// 17. features get the SAME edit/delete/add/revert (they come from the listing, not buyers -- most likely
// to carry marketing wording you would not say on camera).
let fb = B.normalizeBrief({ features: [{ feature: 'ultra-precision blade', benefit: 'volumizes your prep' }] });
ok(fb.features[0].added === false && fb.features[0].derivedFeature === '', 'feature: starts derived, no snapshot yet');
let fe = B.editFeature(fb, 0, { feature: 'sharp blade', benefit: 'cuts clean' });
ok(fe.features[0].feature === 'sharp blade' && fe.features[0].benefit === 'cuts clean' && fe.features[0].edited === true, 'editFeature: sets both fields + edited');
ok(fe.features[0].derivedFeature === 'ultra-precision blade' && fe.features[0].derivedBenefit === 'volumizes your prep', 'editFeature: snapshots BOTH derived fields for revert');
let fr = B.revertFeature(fe, 0);
ok(fr.features[0].feature === 'ultra-precision blade' && fr.features[0].benefit === 'volumizes your prep' && fr.features[0].edited === false, 'revertFeature: restores both derived fields and unlocks');
// snapshot survives a rebuild (adding reviews should not lose revert)
let feR = B.mergeIncremental(fe, { features: [{ feature: 'ultra-precision blade', benefit: 'volumizes your prep' }] }, {});
ok(feR.features[0].feature === 'sharp blade' && feR.features[0].derivedFeature === 'ultra-precision blade', 'feature: edit AND snapshot survive a rebuild (dup feature is not re-added)');
let fa = B.addFeature(fb, 'dishwasher safe', 'no hand washing');
ok(fa.features.length === 2 && fa.features[1].added === true && fa.features[1].edited === true, 'addFeature: appends a line marked mine');
ok(B.deleteFeature(fa, 0).features.length === 1, 'deleteFeature: removes the named feature');
ok(B.revertFeature(fa, 1).features.length === 1, 'revertFeature: an added feature is removed');
// a locked feature is preserved by mergeIncremental (never dropped by a rebuild's dedup)
ok(B.mergeIncremental(fa, { features: [{ feature: 'a new derived feature', benefit: 'x' }] }, {}).features.some(f => f.added && f.feature === 'dishwasher safe'), 'feature: my added feature survives a rebuild');

// 18. generation adapter (Phase 5 step 1a): brief -> flat context with a DEFAULT focus.
let gcBrief = B.emptyBrief();
gcBrief.meta.reviewCount = 22;
gcBrief.lines.who = B.normalizeBrief({lines:{who:{value:'busy parents', words:['no time','exhausted']}}}).lines.who;
gcBrief.lines.emotion = B.normalizeBrief({lines:{emotion:{value:'overwhelmed'}}}).lines.emotion;
gcBrief.lines.desire = B.normalizeBrief({lines:{desire:{value:'a calm kitchen'}}}).lines.desire;
gcBrief.lines.pains = B.normalizeBrief({lines:{pains:[
  {value:'knives dull fast', count:4, words:['goes dull'], claims:['ruined my tomatoes'], about:'alternative'},
  {value:'blocks wear out', count:9, words:['fell apart'], about:'alternative'}
]}}).lines.pains;
gcBrief.lines.objections = B.normalizeBrief({lines:{objections:[
  {value:'too pricey', count:2, words:['not worth it']},
  {value:'will it fit my drawer', count:6, words:['drawer']}
]}}).lines.objections;
gcBrief.features = [{feature:'German steel', benefit:'holds an edge'}];
let gctx = B.briefToGenContext(gcBrief, { description: 'a knife set', winningAngles: [] });
ok(gctx.who === 'busy parents' && gctx.desire === 'a calm kitchen', 'adapter: single lines carried across');
ok(gctx.leadPain && gctx.leadPain.value === 'blocks wear out', 'adapter: default lead pain is the highest-count ALTERNATIVE pain (9 > 4); a product flaw can never be the lead');
ok(gctx.defuseObjection && gctx.defuseObjection.value === 'will it fit my drawer', 'adapter: default defuse objection is the highest-count objection (6 > 2)');
ok(gctx.pains.length === 2 && gctx.features.length === 1, 'adapter: lists and features carried');
// compliance split preserved: words are safe, claims are separate
let leadForClaims = gctx.pains.find(p => p.value === 'knives dull fast');
ok(leadForClaims.words.join() === 'goes dull' && leadForClaims.claims.join() === 'ruined my tomatoes', 'adapter: buyer LANGUAGE and buyer CLAIMS stay separated (compliance)');
// an added (mine) line never leads by default: count 0 sinks below evidence-backed findings
let gcAdded = B.addListItem(gcBrief, 'pains', 'my own hand-added pain');
let gctx2 = B.briefToGenContext(gcAdded, {});
ok(gctx2.leadPain.value === 'blocks wear out', 'adapter: an added (count 0) line never becomes the default lead');
// empty brief -> safe empty context, no throw, no default focus
let gce = B.briefToGenContext(B.emptyBrief(), B.emptyRaw());
ok(gce.leadPain === null && gce.defuseObjection === null && gce.pains.length === 0, 'adapter: empty brief yields a safe empty context');

// 19. script validator (Phase 5 guard): prompt rules were not enforcing the hard bans, so every generated
// script is checked in code -- a violation regenerates it, a second failure drops it. Must catch the exact
// misses the owner saw in the browser.
let clean = { hook: "Your fur baby isn't the problem, it's your vacuum", body1: "You chase the same corner over and over", preclose: "Pull the filter, tap it out, and it breathes again", body2: "The floor stays clear and you move on", cta: "Grab yours from the orange cart" };
ok(B.scriptViolations(clean, { priceAllowed: false }).length === 0, 'validator: a clean script (no figures, no bans) passes');
ok(B.scriptViolations({ preclose: "Shark's customer service will point you to the right one" }, {}).indexOf("company") >= 0, 'validator: catches company customer-service defuse');
ok(B.scriptViolations({ body2: "the warranty covers it and returns are easy" }, {}).indexOf("company") >= 0, 'validator: catches warranty/returns');
ok(B.scriptViolations({ preclose: "The price is hard to justify at first" }, {}).indexOf("price") >= 0, 'validator: catches a price doubt');
// Money is now UNCONDITIONAL: the tool cannot know a price or discount, so no money reference is allowed in
// any slot, even when price IS an objection (a price doubt is answered by showing the outcome, never money).
ok(B.scriptViolations({ preclose: "It costs less than what you already waste" }, { priceAllowed: true }).indexOf("price") >= 0, 'validator: money is banned even when price is an objection (priceAllowed no longer exempts)');
ok(B.scriptViolations({ cta: "You get real ice without spending a fortune" }, {}).indexOf("price") >= 0, 'validator: catches value-in-money framing ("without spending a fortune")');
ok(B.scriptViolations({ body2: "honestly it is worth every penny" }, {}).indexOf("price") >= 0, 'validator: catches "worth every penny"');
ok(B.scriptViolations({ cta: "at this point it is a steal" }, {}).indexOf("price") >= 0, 'validator: catches "a steal"');
ok(B.scriptViolations({ body2: "that is real bang for your buck" }, {}).indexOf("price") >= 0, 'validator: catches "bang for your buck"');
ok(B.scriptViolations({ body2: "the ice is finally clear and crunchy" }, {}).indexOf("price") < 0, 'validator: an outcome line with no money is not flagged');
// names-doubt: the objection turn may not NAME a doubt (its distinctive PHRASE), only SHOW the fix. doubtVocab
// is multiword only, so it catches "hard water" but a benefit line that merely shares a common token passes.
ok(B.scriptViolations({ preclose: "hard water just needs a vinegar rinse now and then" }, { doubtVocab: ["hard water"] }).indexOf("names-doubt") >= 0, 'validator: catches the objection turn NAMING a doubt phrase ("hard water")');
ok(B.scriptViolations({ preclose: "run bottled water through it and it stays clean" }, { doubtVocab: ["hard water"] }).indexOf("names-doubt") < 0, 'validator: the fix ("bottled water") does not trip the "hard water" doubt');
ok(B.scriptViolations({ preclose: "the first cubes are smaller and softer than the rest" }, { doubtVocab: ["smaller and softer"] }).indexOf("names-doubt") >= 0, 'validator: catches a multiword buyer doubt phrase in the turn');
ok(B.scriptViolations({ body1: "it tucks into a small corner of the kitchen" }, { doubtVocab: ["hard water", "too small"] }).indexOf("names-doubt") < 0, 'validator: a benefit line ("small corner") is not flagged and names-doubt is preclose-only');
// viewer-owns: a hook or setup that presupposes the viewer already owns the product.
ok(B.scriptViolations({ hook: "there's a reason people end up with one in two different rooms" }, {}).indexOf("viewer-owns") >= 0, 'validator: catches a hook that assumes the viewer already owns it ("two different rooms")');
ok(B.scriptViolations({ body1: "first one stays on the counter, then you grab one for the patio" }, {}).indexOf("viewer-owns") >= 0, 'validator: catches a setup that assumes ownership ("one for the patio")');
ok(B.scriptViolations({ hook: "your ice runs out before the guests even arrive", body1: "you keep refilling the same tray" }, {}).indexOf("viewer-owns") < 0, 'validator: a normal problem-first hook/setup is not flagged as ownership');
// moved-on: the ownership assumption pointed the other way -- a hook/setup must not presuppose the viewer has
// already replaced or stopped using the thing the script is about ("your old X", "you used to", "back when you").
ok(B.scriptViolations({ hook: "your old air fryer left that plastic taste in everything" }, {}).indexOf("moved-on") >= 0, 'validator: catches "your old X" (writes off anyone still using it)');
ok(B.scriptViolations({ hook: "you used to dread scrubbing the burnt-on bits" }, {}).indexOf("moved-on") >= 0, 'validator: catches "you used to" (past tense assumes they stopped)');
ok(B.scriptViolations({ body1: "back when you fought with a warping pan every night" }, {}).indexOf("moved-on") >= 0, 'validator: catches "back when you" in the setup');
ok(B.scriptViolations({ hook: "the burnt-on bits never scrub off your baking dish", body1: "you scrape at the same corner every night" }, {}).indexOf("moved-on") < 0, 'validator: a present-tense problem hook/setup is not flagged as moved-on');
// health-claim: the model manufacturing its own contamination/leaching claim. Assertions and questions are both
// the claim; the worry-framed form is the carve-out (speaks to a worry, asserts nothing).
ok(B.scriptViolations({ body1: "metal flakes are going into your family's food every meal" }, {}).indexOf("health-claim") >= 0, 'validator: catches a contamination assertion ("metal flakes ... into your food")');
ok(B.scriptViolations({ hook: "is your pan leaving metal flakes in your food" }, {}).indexOf("health-claim") >= 0, 'validator: catches the QUESTION form of the same claim');
ok(B.scriptViolations({ body2: "no chemicals leaching into your family's food" }, {}).indexOf("health-claim") >= 0, 'validator: catches a leaching assertion in the payoff (script-wide, not hook-only)');
ok(B.scriptViolations({ hook: "are you worried about your pan flaking into your food" }, {}).indexOf("health-claim") < 0, 'validator: the worry-framed version is allowed (speaks to a worry, claims nothing)');
ok(B.scriptViolations({ hook: "have you ever wondered what your nonstick is leaching into your dinner" }, {}).indexOf("health-claim") < 0, 'validator: a "have you wondered" worry frame is allowed even with leaching');
ok(B.scriptViolations({ hook: "the sauce slides right off the glass", body1: "you serve straight from the dish to the table" }, {}).indexOf("health-claim") < 0, 'validator: an ordinary food line with no contamination band is not flagged');
ok(B.scriptViolations({ body1: "It shuts off and the plant is dead by morning" }, {}).indexOf("moderation") >= 0, 'validator: catches a moderation word (dead)');
ok(B.scriptViolations({ body2: "so good I use it every single day now" }, {}).indexOf("ownership") >= 0, 'validator: catches first-person ownership (I use)');
ok(B.scriptViolations({ body2: "so good I use it every single day now" }, { ownsAllowed: true }).indexOf("ownership") < 0, 'validator: ownership ALLOWED when the creator owns/uses the product');
ok(B.scriptViolations({ preclose: "my wrist finally stopped aching" }, { ownsAllowed: true }).indexOf("ownership") < 0, 'validator: first-person possessive allowed under ownsAllowed');
ok(B.scriptViolations({ preclose: "my wrist finally stopped aching" }, {}).indexOf("ownership") >= 0, 'validator: catches ownership possessive (my)');
ok(B.scriptViolations({ hook: "It shouldn't take 15 minutes — set up your vacuum" }, {}).indexOf("em-dash") >= 0, 'validator: flags an em dash');
// the hook may confess with "I"; ownership check is body-only
ok(B.scriptViolations({ hook: "I almost talked myself out of this", body1: "You clean the corner over and over", preclose: "Tap the filter out and it breathes again", body2: "The floor stays clear", cta: "Grab one today" }, {}).indexOf("ownership") < 0, 'validator: a confession hook with "I" is allowed (ownership is body-only)');
// the exact leaked line: a CONTRACTED first person ("I've") plus the possessive "mine" -- the old whitelist
// (\bmy\b OR "i <space> <verb>") caught none of it and let invented ownership through with the toggle off.
ok(B.scriptViolations({ preclose: "I've been running mine for months and haven't seen any mold yet" }, {}).indexOf("ownership") >= 0, 'validator: catches contracted first-person ownership ("I\'ve ... mine")');
ok(B.scriptViolations({ preclose: "I've been running mine for months and haven't seen any mold yet" }, { ownsAllowed: true }).indexOf("ownership") < 0, 'validator: that same line is allowed when the creator owns the product');
ok(B.scriptViolations({ body2: "mine sits on the counter and never clogs" }, {}).indexOf("ownership") >= 0, 'validator: catches the possessive "mine" (not just "my")');
ok(B.scriptViolations({ body2: "I'm never going back to bagged ice" }, {}).indexOf("ownership") >= 0, 'validator: catches the contraction "I\'m"');
// generic second-person copy with no first person is still clean (no over-block of "you"/"your")
ok(B.scriptViolations({ body1: "You pour a glass without a second thought", body2: "Your counter stays clear", cta: "Grab one today" }, {}).indexOf("ownership") < 0, 'validator: pure second-person recommender copy is not flagged');
// batch repetition: same objection-turn opening or near-identical CTA
let acc = [{ preclose: "Pull the filter and tap it out", cta: "Grab yours from the orange cart" }];
ok(B.scriptRepeats({ preclose: "Pull the filter, then wipe the housing", cta: "Get one before they sell out" }, acc) === true, 'repeats: same first words of the objection turn is a repeat');
ok(B.scriptRepeats({ preclose: "Charge it by the door instead", cta: "Grab yours from the orange cart today" }, acc) === true, 'repeats: near-identical CTA opening is a repeat');
ok(B.scriptRepeats({ preclose: "Charge it by the door instead", cta: "Add it to your cart now" }, acc) === false, 'repeats: a genuinely different turn and CTA passes');
// repeatDetail: names the colliding slot and hands back the exact prefixes already used, so the retry can steer
let detPc = B.repeatDetail({ preclose: "Pull the filter, then wipe the housing", cta: "Get one before they sell out" }, acc);
ok(detPc.length === 1 && detPc[0].slot === "pre-close", 'repeatDetail: reports the pre-close as the colliding slot');
ok(detPc[0].prefix === "pull the filter" && detPc[0].used.indexOf("pull the filter") >= 0, 'repeatDetail: hands back the normalized 3-word pre-close prefix already used');
let detCta = B.repeatDetail({ preclose: "Charge it by the door instead", cta: "Grab yours from the orange cart today" }, acc);
ok(detCta.length === 1 && detCta[0].slot === "CTA", 'repeatDetail: reports the CTA as the colliding slot');
ok(detCta[0].used.indexOf("grab yours from the") >= 0, 'repeatDetail: hands back the normalized 4-word CTA prefix already used');
ok(B.repeatDetail({ preclose: "Charge it by the door instead", cta: "Add it to your cart now" }, acc).length === 0, 'repeatDetail: a genuinely different turn and CTA reports no collision');
// the repetition guard now also covers the SETUP opening (body1) -- the near-identical-openings issue in the setup slot
let accB1 = [{ body1: "You reach for the board and it slides", preclose: "x", cta: "y" }];
ok(B.scriptRepeats({ body1: "You reach for the good knife" }, accB1) === true, 'repeats: same first words of the SETUP opening ("you reach for") is a repeat');
ok(B.scriptRepeats({ body1: "The onions are half chopped already" }, accB1) === false, 'repeats: a genuinely different setup opening passes');
let detB1 = B.repeatDetail({ body1: "You reach for the good knife" }, accB1);
ok(detB1.length === 1 && detB1[0].slot === "setup opening" && detB1[0].used.indexOf("you reach for") >= 0, 'repeatDetail: reports the setup opening as the colliding slot with its prefix');

// defusePool: threshold DEPENDS on resolve -- resolvable needs 2 mentions, defuse-only (empty resolve) needs 1
let dpObjs = B.normalizeBrief({lines:{objections:[
  { value:'worried it warps in the dishwasher', count:1, resolve:'you hand wash it and it stays flat' }, // resolvable, only 1 mention -> excluded
  { value:'the board slides on the counter', count:1 },                                                  // defuse-only, 1 mention -> KEPT
  { value:'needs oiling now and then', count:2, resolve:'you rub oil in once a month' }                  // resolvable, 2 mentions -> kept
]}}).lines.objections;
let pool = B.defusePool(dpObjs, []);
ok(pool.some(function(o){ return o.value === 'the board slides on the counter'; }), 'defusePool: a single-mention DEFUSE-ONLY objection (empty resolve) is grounded');
ok(!pool.some(function(o){ return o.value === 'worried it warps in the dishwasher'; }), 'defusePool: a single-mention RESOLVABLE objection (has resolve) is still excluded (needs 2)');
ok(pool.some(function(o){ return o.value === 'needs oiling now and then'; }), 'defusePool: a two-mention resolvable objection is kept');
// A product FLAW must never enter the objection pool. Generation now passes [] for product-pains, so even a
// heavily-reviewed defect ("arrives damaged", 7 mentions) can never be assigned, named, or become a subject.
let flawObjs = B.normalizeBrief({lines:{objections:[{value:'will it warp over time', count:3}]}}).lines.objections;
let poolNoFlaw = B.defusePool(flawObjs, []);   // the exact call generation now makes
ok(!poolNoFlaw.some(function(o){ return /arrives damaged/.test(o.value); }), 'defusePool([]): a product flaw is excluded entirely (it was never passed in)');
ok(poolNoFlaw.some(function(o){ return o.value === 'will it warp over time'; }), 'defusePool([]): a real buyer objection is still curated');

// matchObjectionsToThreads: an objection goes to the script whose SCENARIO shares words with it, not by position
let mObjs = [{ value:'the board slides around on the counter', words:['slides','sliding'] }, { value:'it arrives already oiled and ready', words:['oiled','ready'] }];
let threadA = B.fitTokens('the cutting board slides while you chop');   // shares "slides"/"board"
let threadB = B.fitTokens('you have to keep re-oiling the wood');       // shares "oil"
let mAssign = B.matchObjectionsToThreads([threadA, threadB], mObjs);
ok(mAssign[0] && mAssign[0].value.indexOf('slides') >= 0, 'match: the sliding objection goes to the sliding-thread script');
ok(mAssign[1] && mAssign[1].value.indexOf('oiled') >= 0, 'match: the oiling objection goes to the oiling-thread script (not by position)');
let noFit = B.matchObjectionsToThreads([B.fitTokens('the sauce wipes right off the glass')], [{ value:'it arrives in the original packaging', words:['packaging','unboxing'] }]);
ok(noFit[0] === null, 'match: an objection that shares no words with the thread is NOT forced in (null -> close mode)');

// 20. asserted-number quarantine: ANY specific figure in the SCRIPT is caught, whether it came from the
// seller, a buyer, or was invented -- the creator measured none of them. This is the fix for figures that
// slipped because they were fabricated (not in the source) or in a form the extractor missed.
ok(B.numberUnits("It's ready every six or seven minutes").indexOf("six or seven minutes") >= 0, 'numberUnits: word-form range');
ok(B.numberUnits("survives 90-degree heat").length > 0, 'numberUnits: hyphenated 90-degree (was missed)');
ok(B.numberUnits("descale it once a month").length > 0, 'numberUnits: frequency "once a month" (was missed)');
ok(B.numberUnits("five minutes and done").length > 0, 'numberUnits: plain "five minutes"');
ok(B.numberUnits("grab a second one today").length === 0, 'numberUnits: "a second one" is an ordinal, not a figure');
let noMatchListing = { listingText: "Makes ice fast and stays quiet on your counter" };
ok(B.scriptViolations({ body1: "It's ready every six or seven minutes" }, noMatchListing).indexOf("asserted-number") >= 0, 'validator: a figure not in the listing is blocked (six or seven minutes)');
ok(B.scriptViolations({ hook: "Your patio survives 90-degree heat" }, noMatchListing).indexOf("asserted-number") >= 0, 'validator: a FABRICATED figure not in the listing is blocked (90-degree)');
ok(B.scriptViolations({ preclose: "Descale it once a month and forget it" }, noMatchListing).indexOf("asserted-number") >= 0, 'validator: a fabricated frequency not in the listing is blocked (once a month)');
// No listing at all -> provenance cannot be judged, so figures are NOT blocked (blocking them nuked whole
// batches on review-only products). Percent is still always blocked.
ok(B.scriptViolations({ body1: "It's ready every six or seven minutes" }, {}).indexOf("asserted-number") < 0, 'validator: with NO listing, a figure is allowed (cannot judge provenance)');
ok(B.scriptViolations({ hook: "Your patio survives 90-degree heat" }, {}).indexOf("asserted-number") < 0, 'validator: with NO listing, even a suspect figure is allowed');
ok(B.scriptViolations({ cta: "You get 20 percent more ice" }, {}).indexOf("asserted-number") >= 0, 'validator: percent is blocked even with no listing');
ok(B.scriptViolations({ body1: "Fresh ice before your coffee even brews" }, {}).indexOf("asserted-number") < 0, 'validator: a script with no figure passes');
// PROVENANCE: a figure in the LISTING is a verifiable spec and is allowed; review-only or invented is blocked.
let listing = "Makes up to 33 pounds of ice a day. Holds 25 ounces. Measures 26 inches deep.";
ok(B.scriptViolations({ body1: "It quietly makes 33 pounds of ice a day" }, { listingText: listing }).indexOf("asserted-number") < 0, 'validator: a listing spec (33 pounds a day) is ALLOWED');
ok(B.scriptViolations({ hook: "Holds 25 ounces so it lasts", body2: "and it is 26 inches deep" }, { listingText: listing }).indexOf("asserted-number") < 0, 'validator: multiple listing specs (25 ounces, 26 inches) allowed');
ok(B.scriptViolations({ body1: "It's ready every six or seven minutes" }, { listingText: listing }).indexOf("asserted-number") >= 0, 'validator: a REVIEW-only figure is blocked even with a listing (six or seven minutes not in listing)');
ok(B.scriptViolations({ hook: "It survives 90-degree heat" }, { listingText: listing }).indexOf("asserted-number") >= 0, 'validator: an INVENTED figure is blocked even with a listing (90-degree not in listing)');
ok(B.scriptViolations({ body1: "It makes 33 pounds a day and chills in 5 minutes" }, { listingText: listing }).indexOf("asserted-number") >= 0, 'validator: one allowed + one invented figure -> still flagged (5 minutes not in listing)');
ok(B.scriptViolations({ cta: "You get 20 percent more ice" }, { listingText: "20 percent more efficient than the last model" }).indexOf("asserted-number") >= 0, 'validator: percent is blocked REGARDLESS of the listing');
// The wiring bug: provenance is judged by NUMBER, not the unit spelling. A listing that says "33 lbs per 24
// hours" must clear a script that says "33 pounds a day", and a dimension list must expose all its numbers.
let specListing = "Ice output 33 lbs per 24 hours. 1.8 L tank. Dimensions 16.33 x 6.7 x 13.58 inches.";
ok(B.scriptViolations({ body1: "It makes 33 pounds of ice a day" }, { listingText: specListing }).indexOf("asserted-number") < 0, 'validator: "33 pounds" clears against listing "33 lbs" (match by number, not unit word)');
ok(B.scriptViolations({ hook: "A 1.8 liter tank keeps it going" }, { listingText: specListing }).indexOf("asserted-number") < 0, 'validator: "1.8 liter" clears against listing "1.8 L"');
ok(B.scriptViolations({ body2: "Just 13.58 inches of counter and it fits" }, { listingText: specListing }).indexOf("asserted-number") < 0, 'validator: a dimension figure (13.58) from the listing is allowed');
ok(B.scriptViolations({ body2: "Only 6.7 inches wide on the shelf" }, { listingText: specListing }).indexOf("asserted-number") < 0, 'validator: a mid-dimension number (6.7) with no adjacent unit is still recognized from the listing');
ok(B.scriptViolations({ preclose: "Ready every six or seven minutes" }, { listingText: specListing }).indexOf("asserted-number") >= 0, 'validator: a review figure (6 or 7 minutes) is still blocked -- those numbers are not in the listing');
ok(B.scriptViolations({ hook: "Descale it once a month" }, { listingText: specListing }).indexOf("asserted-number") >= 0, 'validator: "once a month" (1) blocked -- 1 is not a listing number (1.8 is)');
// numbersIn: the shared helper, digit and word form.
ok(B.numbersIn("33 lbs per 24 hours")["33"] && B.numbersIn("33 lbs per 24 hours")["24"], 'numbersIn: pulls 33 and 24 from a spec');
ok(B.numbersIn("16.33 x 6.7 x 13.58")["16.33"] && B.numbersIn("16.33 x 6.7 x 13.58")["6.7"] && B.numbersIn("16.33 x 6.7 x 13.58")["13.58"], 'numbersIn: pulls all three dimension numbers');
ok(B.numbersIn("six or seven minutes")["6"] && B.numbersIn("six or seven minutes")["7"], 'numbersIn: converts word numbers to digits');
ok(!B.numbersIn("1.8 L tank")["1"], 'numbersIn: "1.8" is one number, not also "1"');
ok(B.scriptViolations({ cta: "Grab it for just $40 today" }, {}).indexOf("price") >= 0, 'validator: a currency figure ($40) is blocked as price');
ok(B.scriptViolations({ cta: "Only 40 bucks right now" }, {}).indexOf("price") >= 0, 'validator: "40 bucks" is blocked as price');
ok(B.scriptViolations({ body2: "The ice is ready before you know it" }, { listingText: listing }).indexOf("asserted-number") < 0, 'validator: a figure-free script with a listing still passes');
// example-lift: a teaching exemplar recited (verbatim or close) is rejected, the same as a lifted review.
let EX = ["Somehow people keep buying a second one.", "Your fur baby isn't the problem, it's your vacuum.", "Everyone blames the battery. It's the filter."];
ok(B.exemplarLift({ hook: "Somehow people keep buying a second one" }, EX), 'exemplarLift: verbatim exemplar caught');
ok(B.exemplarLift({ hook: "Somehow people keep buying a second unit" }, EX), 'exemplarLift: close paraphrase caught (one/unit swap)');
ok(B.exemplarLift({ hook: "Your fur baby isn't the problem, it's your ice maker" }, EX), 'exemplarLift: reworded tail still caught (fur baby template)');
ok(!B.exemplarLift({ hook: "Your morning drink deserves real nugget ice" }, EX), 'exemplarLift: an original line is NOT flagged');
ok(!B.exemplarLift({ cta: "Grab yours before they go" }, EX), 'exemplarLift: a short generic CTA is not flagged');
ok(B.scriptViolations({ hook: "Somehow people keep buying a second one" }, { exemplars: EX }).indexOf("example-lift") >= 0, 'validator: example-lift wired through scriptViolations');
ok(B.scriptViolations({ hook: "Cold drinks should not feel like a chore" }, { exemplars: EX }).indexOf("example-lift") < 0, 'validator: an original hook passes the exemplar check');
// moderation: the past tense "died" was slipping through
ok(B.scriptViolations({ hook: "Your last machine died on you" }, {}).indexOf("moderation") >= 0, 'validator: catches "died" (past tense was missed)');
ok(B.scriptViolations({ hook: "It kills the mess in seconds" }, {}).indexOf("moderation") >= 0, 'validator: catches "kills"');

// 21. broadened company net + verbatim-lift + code grounding (the exact misses in the ice-maker batch).
ok(B.scriptViolations({ preclose: "The maker stood behind it when the first unit had issues" }, {}).indexOf("company") >= 0, 'validator: catches "the maker stood behind it" (was slipping through)');
ok(B.scriptViolations({ preclose: "If anything goes wrong they make it right fast" }, {}).indexOf("company") >= 0, 'validator: catches "they make it right"');
ok(B.scriptViolations({ hook: "This little ice maker lives on your counter" }, {}).indexOf("company") < 0, 'validator: "ice maker" is NOT a company hit (bare maker avoided)');
ok(B.scriptViolations({ hook: "The first batch of cubes that drop are always smaller" }, { reviewsText: "honestly the first batch of cubes that drop are always smaller and watery" }).indexOf("lifted") >= 0, 'validator: catches a review sentence lifted verbatim');
ok(B.scriptViolations({ hook: "Your morning ice should not taste like effort" }, { reviewsText: "the first batch of cubes that drop are always smaller" }).indexOf("lifted") < 0, 'validator: an original line is not a lift');
// groundedFindings: a classified brief drops derived 0/0 findings but keeps evidence-backed, comment-only, and user lines
let gf = [
  B.normalizeBrief({lines:{objections:[{value:'real objection', count:4}]}}).lines.objections[0],
  B.normalizeBrief({lines:{objections:[{value:'invented, no evidence', count:0, ccount:0}]}}).lines.objections[0],
  B.normalizeBrief({lines:{objections:[{value:'from the comments', count:0, ccount:3}]}}).lines.objections[0],
  B.normalizeBrief({lines:{objections:[{value:'my own line', count:0, ccount:0, added:true}]}}).lines.objections[0]
];
let gfOut = B.groundedFindings(gf, true).map(o=>o.value);
ok(gfOut.indexOf('invented, no evidence') < 0, 'groundedFindings: drops a derived 0-review 0-comment finding');
ok(gfOut.indexOf('real objection') >= 0 && gfOut.indexOf('from the comments') >= 0 && gfOut.indexOf('my own line') >= 0, 'groundedFindings: keeps evidence-backed, comment-only, and added lines');
ok(B.groundedFindings(gf, false).length === 4, 'groundedFindings: an UNclassified brief drops nothing (counts not trustworthy yet)');

// groundedObjections: the mechanical defusable pool for generation. >=2 reviews OR >=2 comments OR owner-added.
let goHeavy = { value: 'battery only lasts', count: 6, ccount: 0, added: false };
let goComment = { value: 'raised in comments', count: 0, ccount: 3, added: false };
let goAdded = { value: 'owner added this', count: 0, ccount: 0, added: true };
let goOneReview = { value: 'one lonely mention', count: 1, ccount: 0, added: false };
let goZero = { value: 'not counted in the reviews', count: 0, ccount: 0, added: false };
let goOneComment = { value: 'single comment only', count: 0, ccount: 1, added: false };
let goPool = B.groundedObjections([goZero, goOneReview, goComment, goHeavy, goAdded, goOneComment]).map(o => o.value);
ok(goPool.indexOf('battery only lasts') >= 0, 'groundedObjections: keeps a >=2-review objection');
ok(goPool.indexOf('raised in comments') >= 0, 'groundedObjections: keeps a >=2-comment objection');
ok(goPool.indexOf('owner added this') >= 0, 'groundedObjections: keeps an owner-added objection');
ok(goPool.indexOf('one lonely mention') < 0, 'groundedObjections: drops a 1-of-N non-issue (count 1)');
ok(goPool.indexOf('single comment only') < 0, 'groundedObjections: drops a lone-comment objection (ccount 1)');
ok(goPool.indexOf('not counted in the reviews') < 0, 'groundedObjections: drops the ice-maker case (0 reviews, 0 comments)');
ok(goPool[0] === 'battery only lasts', 'groundedObjections: sorted heaviest first');
// The ice-maker batch: EVERY objection reads "not counted" -> empty pool, so no script manufactures one.
ok(B.groundedObjections([goZero, goOneReview, goOneComment]).length === 0, 'groundedObjections: all-ungrounded -> empty pool (no manufactured fallback)');
ok(B.groundedObjections([]).length === 0, 'groundedObjections: empty in, empty out');
// causedObjection: the gate for the objection-as-curiosity hook. Only a GROUNDED objection whose mechanism the
// material names (non-empty cause) qualifies; without one, the hook source must not be available.
ok(B.causedObjection([{ value:'shuts off early', count:5, ccount:0, cause:'the filter clogs' }]).value === 'shuts off early', 'causedObjection: grounded objection WITH a cause qualifies');
ok(B.causedObjection([{ value:'shuts off early', count:5, ccount:0, cause:'' }]) === null, 'causedObjection: grounded objection with NO cause does not qualify (hook unavailable)');
ok(B.causedObjection([{ value:'noisy', count:1, ccount:0, cause:'the fan' }]) === null, 'causedObjection: an ungrounded objection (count 1) never qualifies even with a cause');
ok(B.causedObjection([]) === null, 'causedObjection: no objections -> null');
// Year: a past year is a legit contrast device; asserting the current or a future year is blocked.
ok(B.scriptViolations({ hook: "You're still making ice by hand in 2026" }, { nowYear: 2026 }).indexOf("current-year") >= 0, 'validator: asserting the current year (2026) is blocked');
ok(B.scriptViolations({ hook: "This isn't 2010, your ice should be instant" }, { nowYear: 2026 }).indexOf("current-year") < 0, 'validator: a PAST year as contrast (2010) is allowed');
ok(B.scriptViolations({ cta: "The future is 2027, get yours" }, { nowYear: 2026 }).indexOf("current-year") >= 0, 'validator: a future year is blocked too');
ok(B.scriptViolations({ hook: "Still doing this in 2026" }, {}).indexOf("current-year") < 0, 'validator: with no nowYear passed, the year guard does not fire');
// market-claim: an invented sweeping trend ("nobody wants X anymore") is blocked; ordinary lines are not.
ok(B.scriptViolations({ hook: "Nobody wants regular ice cubes anymore" }, {}).indexOf("market-claim") >= 0, 'validator: catches an invented market trend (nobody wants ... anymore)');
ok(B.scriptViolations({ hook: "Everyone is switching these days" }, {}).indexOf("market-claim") >= 0, 'validator: catches "everyone is switching these days"');
ok(B.scriptViolations({ hook: "Everyone needs cold drinks in summer" }, {}).indexOf("market-claim") < 0, 'validator: an ordinary "everyone needs" line is NOT a market claim');
ok(B.scriptViolations({ hook: "We're not waiting on the cart girl anymore" }, {}).indexOf("market-claim") < 0, 'validator: a "we" cultural-moment line is allowed (not nobody/everyone)');
// cause survives normalize + adapter, and consolidation carries it on the representative.
let bWithCause = B.normalizeBrief({ lines:{ objections:[{ value:'it shuts off', count:4, classified:true, cause:'the filter clogs' }] } });
ok(bWithCause.lines.objections[0].cause === 'the filter clogs', 'normalizeBrief: preserves objection.cause');
let ctxC = B.briefToGenContext(bWithCause, B.emptyRaw());
ok(ctxC.objections[0].cause === 'the filter clogs', 'briefToGenContext: exposes objection.cause');
let clusteredC = B.applyClusters([{ value:'shuts off', count:2, cause:'the filter clogs' }, { value:'stops early', count:3, cause:'' }], { groups:[{ value:'shuts off early', members:[0,1] }] }, 10);
ok(clusteredC[0].cause === 'the filter clogs', 'applyClusters: representative carries the first grounded cause through consolidation');
// pain `about`: alternative (old way) may lead; product (this product's flaw) is a doubt only. Round-trips.
let bAbout = B.normalizeBrief({ lines:{ pains:[{ value:'my old vacuum was too heavy', count:4, about:'alternative' }, { value:'the first batch is watery', count:3, about:'product' }] } });
ok(bAbout.lines.pains[0].about === 'alternative' && bAbout.lines.pains[1].about === 'product', 'normalizeBrief: preserves pain.about');
let ctxA = B.briefToGenContext(bAbout, B.emptyRaw());
ok(ctxA.pains[0].about === 'alternative' && ctxA.pains[1].about === 'product', 'briefToGenContext: exposes pain.about');
let clusteredA = B.applyClusters([{ value:'old vacuum too heavy', count:2, about:'alternative' }, { value:'lugging it upstairs', count:3, about:'' }], { groups:[{ value:'the old way was heavy', members:[0,1] }] }, 10);
ok(clusteredA[0].about === 'alternative', 'applyClusters: representative carries the first pain.about through consolidation');
let uni = B.applyUnifiedClusters([{ value:'watery first batch', count:2, about:'product' }], [{ value:'worth it', count:2 }], { clusters:[{ value:'watery first batch', category:'pain', members:[0] }] }, 10);
ok(uni.pains[0].about === 'product', 'applyUnifiedClusters: pain.about survives the unified merge');
// Maslow `need` on pains and desire round-trips through normalize, adapter, and consolidation.
let bNeed = B.normalizeBrief({ lines:{ desire:{ value:'everyone asks', need:'esteem' }, pains:[{ value:'kid could choke on sharp ice', count:5, need:'safety' }] } });
ok(bNeed.lines.pains[0].need === 'safety' && bNeed.lines.desire.need === 'esteem', 'normalizeBrief: preserves pain.need and desire.need');
let ctxN = B.briefToGenContext(bNeed, B.emptyRaw());
ok(ctxN.pains[0].need === 'safety' && ctxN.desireNeed === 'esteem', 'briefToGenContext: exposes pain.need and desireNeed');
// product name is threaded into the context so a script can actually say what the product is (not just "it")
ok(B.briefToGenContext(B.emptyBrief(), B.emptyRaw(), 'Shark WANDVAC').name === 'Shark WANDVAC', 'briefToGenContext: threads the product name into ctx.name');
ok(B.briefToGenContext(B.emptyBrief(), B.emptyRaw()).name === '', 'briefToGenContext: name defaults to empty when none is passed (old 2-arg callers unaffected)');
let clN = B.applyClusters([{ value:'sharp ice', count:2, need:'safety' }, { value:'kids around', count:3, need:'' }], { groups:[{ value:'sharp ice near kids', members:[0,1] }] }, 10);
ok(clN[0].need === 'safety', 'applyClusters: representative carries the first need through consolidation');
// Cap at 5 so a giant brief never floods the batch.
let goMany = [];
for (let i = 0; i < 9; i++) goMany.push({ value: 'obj ' + i, count: 9 - i, ccount: 0, added: false });
ok(B.groundedObjections(goMany).length === 5, 'groundedObjections: caps the pool at 5');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
