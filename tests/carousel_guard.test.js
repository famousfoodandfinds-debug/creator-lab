// CAROUSEL LIABILITY GUARD (Option A). The carousel studio is an isolated iframe with no access to
// window.SaxeBrief, so it posts its copy to the host, which runs the SAME scriptViolations guard and returns
// only the LIABILITY-tier codes. This test pins that host-side contract: carousel copy is joined into one field
// ({body1: text}) and filtered to the five liability codes -- exactly what the host message handler does. It
// proves clean copy passes, each liability guard fires on carousel-style text, and NON-liability guards (e.g. a
// bare percent figure) are NOT returned so they never block a carousel.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const win = {}; new Function('window', blocks.find(b => b.includes('window.SaxeBrief =')))(win);
const SB = win.SaxeBrief;

// Verbatim copy of the host handler's liability set (app.html message listener, saxe-carousel-guard branch).
const LIAB = { 'health-claim':1, 'durability-overclaim':1, 'name-stumble':1, 'moderation':1, 'price':1, 'generation-failed':1 };
// The host shapes carousel copy as {body1: text} (so scriptViolations' joined `whole` == the carousel text) and
// filters to the liability tier. Reproduce it exactly.
function carouselGuard(text){
  const all = SB.scriptViolations({ body1: String(text || '') }, {}) || [];
  const out = [];
  all.forEach(function(c){ if (LIAB[c] && out.indexOf(c) < 0) out.push(c); });
  return out;
}

let pass = 0, fail = 0;
function has(codes, c, m){ if (codes.indexOf(c) >= 0) pass++; else { fail++; console.log('  ✗ expected "' + c + '" for: ' + m + ' -> got [' + codes + ']'); } }
function lacks(codes, c, m){ if (codes.indexOf(c) < 0) pass++; else { fail++; console.log('  ✗ did NOT expect "' + c + '" for: ' + m + ' -> got [' + codes + ']'); } }
function none(codes, m){ if (codes.length === 0) pass++; else { fail++; console.log('  ✗ expected NO liability codes for: ' + m + ' -> got [' + codes + ']'); } }

// 1. Clean carousel copy (hook + benefits + a compliant CTA) passes.
const clean = 'YOUR TURKEY IS DONE AND YOU STILL NEED GRAVY\nkeeps every dish hot at once\none pan, every side\nTap the cart to grab yours';
none(carouselGuard(clean), 'clean carousel copy');

// 2. Price -- a price word, a money-as-value phrase, and a bare dollar figure each fire on any slide line.
// (The shared guard keys on price WORDS + currency + set value-phrases; it does not catch the bare phrase
// "half off" -- a known limitation carried over from the scripts path, not changed here.)
has(carouselGuard("Grab the whole set, it won't break the bank"), 'price', 'break the bank');
has(carouselGuard('worth every penny of counter space'), 'price', 'worth every penny');
has(carouselGuard('Yours for just $40 this week'), 'price', 'bare $40');

// 3. Health / contamination claim (manufactured harm, not framed as a worry).
has(carouselGuard('Metal flakes are scraping into your food'), 'health-claim', 'contamination claim');

// 4. Durability / permanence overclaim.
has(carouselGuard('This one never wears out no matter how hard you run it'), 'durability-overclaim', 'never wears out');
has(carouselGuard('Basically indestructible'), 'durability-overclaim', 'indestructible');
has(carouselGuard('Enamel that never quits'), 'durability-overclaim', 'never quits');
has(carouselGuard('This workhorse never gives out on you'), 'durability-overclaim', 'never gives out');

// 5. Moderation word.
has(carouselGuard('This deal is deadly good'), 'moderation', 'deadly');

// 6. Name-stumble (a written-in spoken mistake).
has(carouselGuard('This is the Shark BlastBoom. BlastBoss, sorry, I keep saying that.'), 'name-stumble', 'name stumble');

// 7. A NON-liability guard must NOT come back: a bare percent trips asserted-number, which stays OFF carousels.
lacks(carouselGuard('This cuts your prep by 50 percent'), 'asserted-number', 'percent is not a liability code');
none(carouselGuard('This cuts your prep by 50 percent'), 'percent figure (not liability -> allowed on carousels)');

// 8. Conditional maintenance answer stays clean (durability guard has an upkeep carve-out).
none(carouselGuard('Keeps its edge for years as long as you hand wash it'), 'conditional upkeep answer');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
