/* FANO-1 Workstation — window manager for the SPEC-007 dossier desktop.
   Vanilla JS, no dependencies. Documents open in iframes; folders open
   directory listings; the drawer stays locked on principle.

   RETRO-DEV LOG (20-iteration gamified rebuild, in place):
     01 minimize button            — window chrome 1→2 controls
     02 maximize/restore           — chrome 2→3 controls
     03 resize grip                — fixed→free window geometry
     04 icon drag/rearrange        — static→stateful desktop
     05 localStorage persistence   — session memory 0→1
     06 clearance XP               — passive→progressive desktop
     07 achievements               — silent→rewarding
     08 egg hunt                   — covert layer→collectibles
     09 konami code                — one theme→hidden theme
     10 CRT phosphor mode          — visual modes 1→2
     11 POST boot                  — instant→ceremonial launch
     12 Qstar desk-pet             — 421-node lattice, alive
     13 terminal                   — icons→icons+commands
     14 start search/run           — menu→menu+run box
     15 context menus              — left-click→both clicks
     16 keyboard shortcuts         — mouse-only→full keyboard
     17 webaudio bleeps            — silent desk→talking desk
     18 edge-snap tiling           — free placement→managed
     19 screensaver                — idle wasted→idle spectacle
     20 field manual + save export — session→portable career
*/

(function () {
  "use strict";

  /* ---------- file system ---------- */

  var FS = {
    "L0_PUBLIC": {
      label: "L0 — Public Release", glyph: "▤",
      items: [
        ["public.html", "The Briefing", "the public spec, v1.4.0"],
        ["covert-en.html", "Covert Copy — EN", "the other manuscript"],
        ["covert-zh.html", "Covert Copy — ZH", "Triple-X protocol"],
        ["terminology.html", "Terminology", "words have load paths"],
        ["cover.html", "Dossier Index", "the front cover"],
      ],
    },
    "L1_TRUSTED": {
      label: "L1 — Trusted Numbers", glyph: "▤",
      items: [["verified.html", "The Trusted Numbers", "what the arithmetic proves"]],
    },
    "L2_FILE": {
      label: "L2 — The File", glyph: "▤",
      items: [
        ["dossier.html", "The File on the Asset", "evidence inventory, C1–C52"],
        ["claims.html", "Interrogation Record", "every claim, graded"],
        ["input-audit.html", "Design-Input Audit", "classified inputs, filed suspect"],
      ],
    },
    "L3_OPS": {
      label: "L3 — Q Branch Ops", glyph: "▤",
      items: [
        ["expanded.html", "The Expanded Design", "dual-path powertrain, 3-bus manifold"],
        ["economics.html", "The Ledger", "what it costs, honestly"],
        ["red-team.html", "The Red Team", "engineering revision"],
        ["governance.html", "Governance Gap", "the missing paperwork"],
      ],
    },
    "Q_BRANCH": {
      label: "Q — Branch", glyph: "▤",
      items: [
        ["ledger.html", "Ledger of Fractions", "where the floor dropped something"],
        ["charter.html", "The Charter Beneath", "the charter beneath the charter"],
      ],
    },
    "LEAK_SPILL": {
      label: "LEAK — unsecured", glyph: "▒",
      items: [
        ["manifesto.html", "The Scarcity Loop", "leaked doctrine — TOP SECRET//SCI"],
        ["meter.html", "THREAT FILE: The Meter", "MET-001 — it bills because it cannot build"],
      ],
    },
    "L6_DECON": {
      label: "D — Declassified", glyph: "▤",
      items: [
        ["declassified.html", "The Declassified Exhibits", "D-1/D-2 — real paper, real DOI"],
        ["object-006.html", "OSTF-006 — The Transmission", "the designation was the message"],
        ["006.html", "SPEC-006 (partial)", "the brother file — 006 observes"],
      ],
    },
    "MESH_SOVEREIGN": {
      label: "MESH — sovereign wire", glyph: "▦",
      items: [
        ["fleet.html", "The Sovereign Mesh", "genesis root + manifest, verified in-browser"],
        ["apps/fano/index.html", "The Quine", "the dialect artifact verifies itself"],
      ],
    },
  };

  var COVENANT = [
    "THE COVENANT OF REAL ILLUMINATION",
    "filed: covenant.txt · copy retained on this desktop per regulation",
    "",
    "To dedicate my mind to the discovery of knowledge: lifelong learning,",
    "critical evaluation, seeking truth in an age of misinformation.",
    "",
    "To dedicate my soul to the pursuit of enlightenment: empathy,",
    "understanding, inner peace, and the well-being of all who gather",
    "around the light.",
    "",
    "To dedicate my life and days upon this planet to the protection and",
    "advancement of the human species.",
    "",
    "To dedicate my efforts to the progress of abundance: sustainable",
    "innovation and equitable distribution, improving life for everyone",
    "rather than just a few.",
    "",
    "To dedicate my existence to bringing all people, in all places, into",
    "unification: bridging every divide until the whole human family",
    "shares one light.",
    "",
    "— signed at login. The desk keeps the counter-signature.",
  ].join("\n");

  /* ---------- window manager ---------- */

  var desk = document.getElementById("windows");
  var taskItems = document.getElementById("task-items");
  var zTop = 10;
  var cascade = 0;
  var openWins = {}; // title -> win element

  /* ---------- save state (retro-dev iter 5) ---------- */

  var SAVE_KEY = "fano1.desk.v1";
  var state = { icons: {}, xp: 0, achievements: [], eggs: [], konami: false,
    theme: "station", muted: false, lang: "en", termHist: [], termCmds: [], vizSeen: [],
    dirsSeen: [], palCount: 0, snapped: 0, anoms: [] };
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (raw) state = Object.assign(state, JSON.parse(raw));
    var sharedLang = localStorage.getItem("fano1.lang");
    if (sharedLang === "zh" || sharedLang === "en") state.lang = sharedLang;
  } catch (e) { /* private mode: run stateless */ }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  window.addEventListener("beforeunload", save);

  /* ---------- enrollment gate: the pledge is real (R8) ---------- */

  var ident = (window.FANO_AUTH && FANO_AUTH.loadRecord()) || null;
  if (!ident) {
    /* no signed covenant on file — back to the pledge */
    window.location.href = "index.html";
    return;
  }
  /* every enrollment is a life — the desk noticed the encore */
  try {
    if (parseInt(localStorage.getItem("fano1.lives") || "0", 10) >= 2) egg("secondlife");
  } catch (e) {}

  function unlockPrompt() {
    var title = "unlock — " + ident.user;
    if (openWins[title]) { focus(openWins[title]); return; }
    var d = document.createElement("div");
    d.className = "win-body console";
    d.innerHTML = "<pre style='margin:0;white-space:pre-wrap'>" +
      "agent:   " + ident.user + "\n" +
      "key fp:  " + ident.pk.slice(0, 8).toUpperCase() + "…\n" +
      "role:    " + (FANO_AUTH.ROLE_LABEL[ident.cert.role] || "CADET") + "\n" +
      "covenant: " + ident.covenant_sig.slice(0, 24) + "… ✓\n\n" +
      "passphrase unlocks the keystore. comms stay cold without it.</pre>";
    var inp = document.createElement("input");
    inp.className = "term-in"; inp.type = "password"; inp.placeholder = "passphrase"; inp.spellcheck = false;
    d.appendChild(inp);
    var win = makeWindow(title, d);
    win.style.width = "26rem"; win.style.height = "15rem";
    inp.focus();
    var totpStage = false, unlockedRec = null;
    inp.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      if (totpStage) {
        if (FANO_AUTH.verifyTotp(inp.value)) {
          win.remove(); delete openWins[title];
          var t2 = document.querySelector('.task-item[data-wid="' + win.dataset.wid + '"]');
          if (t2) t2.remove();
          toast("keystore + TOTP verified — " + unlockedRec.user + " on duty"); paintClearance();
        } else { inp.value = ""; inp.placeholder = "invalid code — try again"; }
        return;
      }
      var rec = FANO_AUTH.unlock(inp.value);
      if (rec && rec.totp_required && !FANO_AUTH.session.totp) {
        unlockedRec = rec; totpStage = true;
        inp.value = ""; inp.type = "text"; inp.inputMode = "numeric"; inp.maxLength = 6;
        inp.placeholder = "Google Authenticator code for QStar.net";
        d.querySelector("pre").textContent += "\n\nTOTP required — enter the six-digit QStar.net code.";
        return;
      }
      if (rec && (!rec.totp_required || FANO_AUTH.session.totp)) {
        win.remove();
        delete openWins[title];
        var t = document.querySelector('.task-item[data-wid="' + win.dataset.wid + '"]');
        if (t) t.remove();
        toast("keystore warm — " + (FANO_AUTH.ROLE_LABEL[FANO_AUTH.session.role] || "CADET") + " " + rec.user + " on duty");
        paintClearance();
      } else if (rec && rec.totp_required) {
        if (FANO_AUTH.verifyTotp(inp.value)) {
          win.remove(); delete openWins[title];
          var t2 = document.querySelector('.task-item[data-wid="' + win.dataset.wid + '"]');
          if (t2) t2.remove();
          toast("keystore + TOTP verified — " + rec.user + " on duty"); paintClearance();
        } else { inp.value = ""; inp.placeholder = "invalid code — try again"; }
      } else {
        inp.value = "";
        var lock = FANO_AUTH.lockRemain && FANO_AUTH.lockRemain();
        inp.placeholder = lock ? ("device locked — " + lock + "s") : "wrong passphrase — try again";
      }
    });
  }

  /* ---------- game bus: clearance XP, achievements, toasts ---------- */

  var XP_LEVELS = [0, 40, 100, 200, 320, 480, 680]; // L0–L6 — L6 is Human Security
  var opened = {}; // first-time awards only

  function clearance() {
    var l = 0;
    for (var i = 0; i < XP_LEVELS.length; i++) if (state.xp >= XP_LEVELS[i]) l = i;
    return l;
  }

  var clrEl = document.getElementById("clr");
  function paintClearance() {
    if (clrEl) clrEl.textContent = "CLR L" + clearance() + " · " + state.xp + "xp";
    /* the emblem knows your clearance — brighter as the file trusts you */
    var ws = document.querySelector(".wall svg");
    if (ws) {
      var lvl = clearance();
      ws.style.opacity = (0.10 + lvl * 0.03).toFixed(2);
      ws.style.filter = "drop-shadow(0 0 " + (12 + lvl * 8) + "px rgba(" +
        col("--acc-rgb", "79,195,232") + "," + (0.25 + lvl * 0.1) + "))";
    }
    paint7qLabel();
  }

  function award(n, why) {
    state.xp += n;
    paintClearance();
    save();
    if (why) toast("+" + n + "xp — " + why);
  }

  function firstOpen(key, n, why) {
    if (opened[key]) return;
    opened[key] = true;
    award(n, why);
  }

  var toastWrap = document.getElementById("toasts");
  function toast(msg, cls) {
    if (!toastWrap) return;
    var t = document.createElement("div");
    t.className = "toast " + (cls || "");
    t.textContent = msg;
    toastWrap.appendChild(t);
    sfx.toast();
    if (petGlance) petGlance(); /* the cap looks up */
    setTimeout(function () { t.classList.add("show"); }, 20);
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { t.remove(); }, 400);
    }, 3400);
  }

  /* OS clipboard — Electron bridge first (system clipboard), then the
     web API; last resort is a hidden field + execCommand */
  function copyText(t, okMsg) {
    function done(ok) { toast(ok ? (okMsg || "copied to clipboard") : "copy failed — select and Ctrl+C", "sys"); }
    if (window.ADMIRALTY_DESK && ADMIRALTY_DESK.clipboard) {
      ADMIRALTY_DESK.clipboard.write(t).then(done, function () { done(false); }); return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); }); return;
    }
    try {
      var f = document.createElement("textarea");
      f.value = t; f.style.position = "fixed"; f.style.opacity = "0";
      document.body.appendChild(f); f.select();
      done(document.execCommand("copy")); f.remove();
    } catch (e) { done(false); }
  }

  var ACHIEVEMENTS = {
    first_contact: "First Contact — opened a dossier file",
    archivist: "Archivist — read the whole File (L2)",
    full_read: "Full Read — every page in the dossier",
    denied: "Denied — tried the drawer anyway",
    pyro: "Pyromaniac — read the file that burns",
    sworn: "Sworn In — re-read the covenant",
    qclerk: "Q's Clerk — opened the Ledger of Fractions",
    decorator: "Interior Decorator — moved an icon",
    nightowl: "Night Shift — on the desk past midnight",
    wardrobe: "Wardrobe — changed liveries",
    sysmon: "Instrumented — watched the instruments",
    curator: "Curator — opened every drawer that opens",
    paladin: "Paladin — the fast drawer, five times",
    projectionist: "Projectionist — screened all eight renders",
    historian: "Historian — fifty commands on record",
    completionist: "Completionist — every egg collected",
    resupply: "Resupply — docked the sister platform",
    operator: "Operator — opened the tradecraft desk",
    reader_leak: "Eyes Only — read the leak the drawer lost",
    film_buff: "Film Buff — all twenty-five titles on the roll",
    anomaly_hunter: "Anomaly Hunter — ten cold cases opened",
    fiction_scholar: "Fiction Scholar — twenty-five speculative files read",
    floor_cartographer: "Floor Cartographer — every honest gap inspected",
  };
  function achieve(id) {
    if (state.achievements.indexOf(id) >= 0) return;
    state.achievements.push(id);
    save();
    toast("ACHIEVEMENT — " + ACHIEVEMENTS[id], "ach");
    sfx.chime();
  }
  var DOCS_READ = {};

  /* ---------- egg hunt: seven hidden courtesies of the desk ---------- */

  var EGGS = {
    geom: "Geometry Nerd — clicked the Fano plane",
    fineprint: "Fine Print — read the wall caption",
    zulu: "Zulu Time — consulted the clock",
    fengshui: "Feng Shui — parked an icon in the corner",
    askedtwice: "Asked Twice — the drawer, again, via the menu",
    impatient: "Impatient — pressed OSTF seven times",
    konami: "Old Codes — the sequence still works",
    fano7: "Fano Master — all seven lines in one sitting",
    sisyphus: "Sisyphean — seven attempts against the integer floor",
    poweruser: "Power User — ten distinct commands in the shell",
    importer: "Importer — carried a career between desks",
    fastdrawer: "Fast Drawer — found the palette (Ctrl+K)",
    gallery: "Gallery — screened every pane in the deck",
    waker: "Waker — let the saver run half a minute, then woke it",
    tiler: "Tiler — two windows snapped at once",
    sesamist: "Sesamist — said the magic words anyway",
    standingwave: "Standing Wave — knocked firmly, twice",
    metered: "Meter Reader — met the adversary by name",
    mixologist: "Mixologist — the ledger never stirs",
    attentive: "Attentive — paid attention",
    interrogated: "Expected to Die — asked the wrong question",
    licenced: "Licence Exercised — killed it yourself",
    satellite: "GoldenEye — found the orbital livery",
    residence: "Skyfall — reported the address",
    posture: "Day Zero — the posture, not the date",
    sigil: "Sigma — recited the sealed instrument",
    corps: "AIWO — called the corps",
    axiomatic: "First Free Act — typed the axiom",
    fraction: "One Part in Eight — found the aperture",
    frontoffice: "Universal Exports — asked for the front by name",
    columbus: "Triplicate — filed in Columbus",
    namesake: "Namesake — typed a name from the watch list",
    marathon: "Marathon — five titles on the film roll",
    secondlife: "Second Life — you only live twice",
    interpreter: "Interpreter — switched tongues mid-mission",
    decoder: "Decoder Ring — resolved the 006 chain to its mother tongue",
    fountainhead: "Fountainhead — found the spring west of Astrakhan",
    cleaver: "The Butcher — cut the scarcity ledger",
    transmission: "Transmission — opened the object file",
    sealbreaker: "Seal Breaker — opened the declassified exhibits",
    brotherhood: "Brother File — opened SPEC-006",
    genealogist: "Genealogist — asked after the siblings",
    flagplot: "Flag Plot — entered the Command suite",
    anomaly: "Cold Case — opened a file the lab can't build",
    fictionfile: "Fiction File — read an entry from the speculative drawer",
    codex: "Field Codex — opened the anomalies annex",
  };
  /* ---------- anomaly codex: the honest floor, filed as lore ----------
     The corpus's uncomputable residue lives here as a collectible
     codex. Speculative terms are fiction-framed claims with REAL
     machinery mapped underneath; gap terms are prose headings,
     nature claims, or claims with no honest analogue. Either way,
     the desk files them — it just refuses to pretend they're gadgets. */

  var ANOMALY_LORE = {
    /* --- philotic / ansible family (mapped: science_philotic) --- */
    "philotic connections": "FICTION FILE — Bell-pair edges on file. the correlation matrix is real; the phone call across parsecs is not.",
    "philotic physics": "FICTION FILE — the philotic web computes. signaling capacity: exactly zero. the desk checked twice.",
    "philotic physics (fictional)": "FICTION FILE — labeled fictional by its own author. the web underneath is real math.",
    "philotic time": "FICTION FILE — correlation ignores distance; it also ignores your schedule.",
    "the ansible concept (ftl communication)": "FICTION FILE — instant correlation, zero signal. the no-signaling proof is filed under 'verified in house'.",
    "ender's game: philotic parallax instantaneous communicator": "FICTION FILE — the parallax communicator. Bob's reduced state stays I/2 no matter what Alice does.",
    "ender's game: the ansible revisited": "FICTION FILE — revisited, still correlated, still silent.",
    "ansible and alcubierre drive physics": "FICTION FILE — both halves on file: sech² soliton + philotic web. the math computes; the ship doesn't sail.",
    "alcubierre drive physics": "FICTION FILE — rho·32pi goes negative in the wall. exotic matter required, exotic matter not stocked.",
    /* --- fleet / battle school (mapped: fleetTree, games) --- */
    "battle school computing": "FICTION FILE — the school's compute is a game tree and a lattice. we built both.",
    "ender's jeesh": "FICTION FILE — a small fleet subtree. decapitation count verified.",
    "dragon army formations": "FICTION FILE — formation trees. fan-3, orphan-on-decapitation.",
    "fleet operations": "FICTION FILE — fleetTree + ballots. the fleet runs; the novel stays fiction.",
    "defense operations": "FICTION FILE — defense as a command tree. the orphans are counted honestly.",
    "admiralty council": "FICTION FILE — a council is a quorum. the ballots are sealed on file.",
    "fleet admirals roll call": "FICTION FILE — roll call = quorum check. present.",
    "international fleet command structure (hegemon/strategos/polemarch)": "FICTION FILE — three chairs, one command tree. hegemon included.",
    "international fleet network": "FICTION FILE — the i.f. network mapped to a real fleet tree.",
    "ender's game: international fleet hierarchy": "FICTION FILE — hierarchy verified: one root, counted orphans.",
    "ender's tactical innovation": "FICTION FILE — innovation = a strategy the game tree finds. exhaustive, deterministic.",
    "battle room network": "FICTION FILE — the battle room is an isotropic 3D lattice. degree 6, no up.",
    "battle room architecture and zero-g training": "FICTION FILE — zero-g arena = isotropic mesh. the enemy's gate is down.",
    "ender's game: zero-gravity training environment": "FICTION FILE — lattice3D on file. interior degree 6.",
    "strategic intelligence": "FICTION FILE — strategy is a game tree. the solver doesn't bluff.",
    "ansible addressing across star systems": "FICTION FILE — packed sector addresses. the addressing is real; the ansible is aspirational.",
    "time dilation in ender's game universe": "FICTION FILE — gamma-squared is exact rational, beta=3/5 gives 25/16. the relativity is real; the cadets aren't.",
    /* --- mind game / hive mind (mapped: ann, consensus, game) --- */
    "the mind game's ai architecture": "COLD CASE→BUILT — perceptron assessor + game-tree solver. the architecture computes at toy scale.",
    "the mind game adaptive ai": "FICTION FILE — an adaptive learner in integer arithmetic. it learns AND and OR; it fails XOR, honestly.",
    "ender's game: adaptive ai psychological assessment": "FICTION FILE — the perceptron assesses; the psychology stays in the drawer.",
    "ender's game: adaptive content retrieval": "FICTION FILE — HNSW retrieval. adaptive enough.",
    "mind game's knowledge retrieval and adaptation": "FICTION FILE — retrieval via HNSW, adaptation via perceptron. both on file.",
    "psychological assessment": "FICTION FILE — a perceptron is an assessor of last resort. the desk recommends professional help.",
    "psychological support": "FICTION FILE — affect scoring on file. lexicon-grade empathy.",
    "formic hive coordination": "FICTION FILE — hive coordination = distributed quorum. the consensus is real; the queen is not.",
    "formic collective intelligence": "FICTION FILE — collective intelligence modeled as consensus. no queens were consulted.",
    "formic hive structure": "FICTION FILE — the hive maps to a fleet tree. hierarchy is hierarchy.",
    "the formic hive structure": "FICTION FILE — same structure, second filing.",
    "formic hive mind as neural network": "FICTION FILE — a hive-mind is a perceptron at best. it still can't XOR.",
    "the hive mind as neural network": "FICTION FILE — see above; the second filing also can't XOR.",
    "the hive mind's processing architecture": "FICTION FILE — distributed processing = quorum + lanes.",
    "hive mind distributed processing": "FICTION FILE — the quorum computes; the telepathy doesn't.",
    /* --- the giant's drink (built: game-tree unwinnability) --- */
    "the giant's drink scenario": "COLD CASE→BUILT — a rigged game where no strategy wins. proven exhaustively. the giant pours anyway.",
    "the giant's drink scenario analysis": "COLD CASE→BUILT — minimax proves unwinnability; a winning leaf behind a house node still loses.",
    "psychological modeling": "BUILT — lexicon affect scoring. crude, honest, integer.",
    "4. psychological modeling": "BUILT — same file, numbered edition.",
    "security considerations in the novel": "COLD CASE — the novel's security is narrative. our commitments are real.",
    "the queen's perspective": "FICTION FILE — we can model her quorum; her perspective stays hers.",
    "narrative device": "FICTION FILE — filed under narrative. the desk doesn't model metaphors.",
    "god innovation": "FICTION FILE — beyond scope. the desk's clearance doesn't extend that far.",
    "battle school training philosophy": "FICTION FILE — philosophy is prose; the machinery is filed elsewhere.",
    "battle school and the mind game's temporal structure": "BUILT — temporal structure = game-tree ply alternation.",
    "battle school's computing resources": "BUILT — game tree + lattice. the resources are inventoried.",
    "battle school training philosophy ": "FICTION FILE — the margin notes have opinions, not code.",
    "psychological training implications": "COLD CASE — implications are prose. the affect scorer is the honest part.",
    "training methodology": "COLD CASE — the methodology heading; the train() call is filed under perceptron.",
    /* --- still genuinely unbuilt: the honest gap --- */
    "the problem": "COLD CASE — a prose heading. the desk doesn't pretend it's a gadget.",
    "proof sketch": "COLD CASE — sketches aren't proofs. the real proofs are in zig test.",
    "core insight": "COLD CASE — insight is free; implementation is the bill.",
    "key mechanisms:": "COLD CASE — a colon is not a mechanism.",
    "formal definition": "COLD CASE — the definition is formal; the module is elsewhere.",
    "mathematical definition": "COLD CASE — definitions don't compile.",
    "significance": "COLD CASE — significance asserted, not computed.",
    "strengths": "COLD CASE — strengths listed, not measured.",
    "unique properties": "COLD CASE — uniqueness claimed; the hash didn't verify it.",
    "technical limitations": "COLD CASE — ironically the most honest heading in the pile.",
    "technical limitations vs mind game": "COLD CASE — a comparison heading. both sides filed separately.",
    "physical interpretation": "COLD CASE — interpretation is free; the metric is in astro.",
    "philosophical implications": "COLD CASE — the desk declines philosophy before 0900.",
    "information implications": "COLD CASE — the Shannon bound computes; the implications are yours.",
    "algorithm overview": "COLD CASE — an overview, by definition, is not the algorithm.",
    "algorithmic approaches": "COLD CASE — approaches noted; approaches not built.",
    "applications": "COLD CASE — 'applications' is where claims go to gesture.",
    "applications in modern ai": "COLD CASE — modern ai claims; integer proofs.",
    "modern parallels": "COLD CASE — parallels are for geometry and marketing.",
    "modern implementations": "COLD CASE — 'modern' is not an implementation detail.",
    "real-world parallels": "COLD CASE — the real world didn't sign the pledge.",
    "real-world ai parallels": "COLD CASE — see 'real-world parallels', with hype.",
    "historical context": "COLD CASE — context is history; the ledger is now.",
    "1985 technology context": "COLD CASE — 1985 called; the corpus answered in prose.",
    "2016-2017 breakthroughs": "COLD CASE — breakthroughs claimed; no commit hash provided.",
    "scientific accuracy": "COLD CASE — a heading about accuracy. the irony files itself.",
    "scientific accuracy note": "COLD CASE — a note about accuracy. see above.",
    "scientific speculation": "COLD CASE — speculation, accurately labeled at least.",
    "theoretical possibilities (speculative)": "COLD CASE — theoretical and speculative, double-flagged.",
    "requirements for real implementation": "COLD CASE — requirement one: an implementation.",
    "scale challenges (if real)": "COLD CASE — the '(if real)' does the honest work here.",
    "practical implementation": "COLD CASE — practical is the adjective that admits defeat.",
    "implementation notes": "COLD CASE — notes on implementation; implementation not included.",
    "implementation pathways": "COLD CASE — pathways mapped; destination pending.",
    "performance characteristics": "COLD CASE — characteristics asserted; the bench didn't run.",
    "processing characteristics": "COLD CASE — the processing is elsewhere; this is the heading.",
    "collection design": "BUILT — dirStats computes the collection's actual structure.",
    "design principles": "COLD CASE — principles documented; principles don't execute.",
    "core principles": "COLD CASE — the principles are core; the code is elsewhere.",
    "facility requirements": "COLD CASE — the facility is a laptop. requirement met.",
    "construction": "COLD CASE — ambiguous citation. the desk needs a page number.",
    "construction (1973)": "COLD CASE — 1973 construction, citation unclear. filed pending provenance.",
    "medical ai": "COLD CASE — medical claims need a license the code doesn't hold.",
    "python implementation (sklearn style)": "COLD CASE — wrong language. this fleet computes in zig.",
    "quantum implementation (future)": "COLD CASE — 'future' is a verdict, not a module.",
    "quantum inspiration": "COLD CASE — inspiration isn't computation. the quantum register is elsewhere.",
    "quantum ai systems": "BUILT — quantumClassify: one qubit, exact rational Ry, honest boundary.",
    "quantum power systems": "BUILT — the Ising Hamiltonian IS the energy bookkeeping.",
    "natural language understanding": "BUILT — hashed bag-of-words + linear intent. toy-scale nlu, honestly labeled.",
    "1. natural language understanding": "BUILT — numbered edition of the same machinery.",
    "ai character consistency": "BUILT — determinism IS character consistency at machine scale.",
    "6. **ai character consistency**": "BUILT — the markdown bold promoted too.",
    "minor issues": "BUILT — minorIssueCount counts them. the count is honest.",
    "minor variations": "BUILT — syncDiff's added/dropped shingles ARE the variations.",
    "breaking pattern": "BUILT — a pattern break is a detected anomaly. countAnomalies does it.",
    "scientific references": "BUILT — citationCount: et al. + (20xx) markers, counted.",
    "5. **scientific references**": "BUILT — numbered edition.",
    "modern verification": "BUILT — merkle verification is the modern kind.",
    "2. long-term memory": "BUILT — the KG triple store is persistent memory machinery.",
    /* --- nature claims: held by the batch-8 ruling --- */
    "occurrences in nature": "COLD CASE — arithmetic isn't botany. the ruling stands.",
    "self-similarity in nature": "COLD CASE — we can compute self-similarity; we can't certify ferns.",
    "botanical structures": "COLD CASE — the garden is outside the integer boundary.",
    "biological proportions": "COLD CASE — biology doesn't file fixed-point.",
    "biological organization": "COLD CASE — organization claimed; organism not included.",
    /* --- fiction with no analogue: the held drawer --- */
    "formic consciousness": "HELD — consciousness isn't computable here. the desk keeps the drawer locked.",
    "quantum propulsion": "HELD — no honest analogue on file. the soliton is geometry, not thrust.",
    "quantum weaponry": "HELD — the desk doesn't stock weapons, quantum or otherwise.",
    "terraforming systems": "HELD — terraforming is a budget item for another century.",
    "colonization operations": "HELD — ops file, no machinery.",
    "civilian integration": "HELD — integration is a social claim, not a module.",
    "builderberg systems": "HELD — builderberg is a name, not a number.",
    "sentinel operations": "MAPPED — a sentinel is a drift watcher. EWMA on duty.",
    "logistics supply": "MAPPED — supply routing IS dijkstra. shortest honest path.",
    "special projects classified ops": "HELD — classified ops, filed where classified ops go.",
    "multiversal monitoring": "HELD — we monitor ONE universe's telemetry. it keeps us busy.",
    "speaker for the dead": "FICTION FILE — the speaker speaks for the dead; the desk speaks for the ledger.",
    "after the formic wars": "FICTION FILE — an era, not an algorithm.",
    "ender's game parallel": "FICTION FILE — parallels are prose.",
    "ender's parallel": "FICTION FILE — a shorter parallel, still prose.",
    "the ender's game universe": "FICTION FILE — the universe is fictional; its machinery is filed separately.",
    "fictional technology": "META — the label the drawer puts on itself.",
    "b. research recommended 🔍": "COLD CASE — research is always recommended. the emoji is decorative.",
    "collection design ": "BUILT — see 'collection design'.",
    "security considerations in the novel ": "COLD CASE — narrative security; real commitments elsewhere.",
  };
  var ANOMALY_FALLBACK = "COLD CASE — no computable analogue on file. the desk doesn't pretend.";
  var MAPPED_FALLBACK = "FICTION FILE — fiction-framed claim, real machinery mapped on file. the math is honest; the framing stays in the drawer.";
  var FLOOR_VERDICTS = { gap: 1, speculative: 1, speculative_mapped: 1, mappable: 1 };
  function anomalySeen(t) {
    if (!FLOOR_VERDICTS[t.verdict]) return;
    if (state.anoms.indexOf(t.term) < 0) {
      state.anoms.push(t.term);
      save();
      if (state.anoms.length === 1) egg("anomaly");
      if (t.verdict === "speculative" || t.verdict === "speculative_mapped") egg("fictionfile");
      if (state.anoms.length === 10) achieve("anomaly_hunter");
      if (state.anoms.length === 25) achieve("fiction_scholar");
      if (state.anoms.length === state.anomsTotal && state.anomsTotal > 0) achieve("floor_cartographer");
    }
  }

  /* ---------- film roll: twenty-five EON titles, one line each ---------- */

  var FILMS = {
    "dr no": "1962 — the first file. the doctor never stood a chance.",
    "from russia with love": "1963 — the spectre file. the -FR suffix reads 'from russia'. ask the desk about 006.",
    "goldfinger": "1964 — no, agent. the desk expects you to test.",
    "thunderball": "1965 — two atomic devices, one large font.",
    "you only live twice": "1967 — which is one more life than a burned keystore gets.",
    "on her majestys secret service": "1969 — the one where the ledger wins and nobody is happy about it.",
    "diamonds are forever": "1971 — so is a sha256.",
    "live and let die": "1973 — the drawer lives; the identity dies.",
    "the man with the golden gun": "1974 — the funhouse version of a signature check.",
    "the spy who loved me": "1977 — the submarine went off-ledger. it happens.",
    "moonraker": "1979 — the uplink, but louder.",
    "for your eyes only": "1981 — try 'eyes only'.",
    "octopussy": "1983 — eight arms, zero engineering authority.",
    "a view to a kill": "1985 — zorin had a dirigible; we have a dossier.",
    "the living daylights": "1987 — a sniper duet in the margin notes.",
    "licence to kill": "1989 — type 'licence' and the desk honours it literally.",
    "goldeneye": "1995 — there is a livery named after this. earn it.",
    "tomorrow never dies": "1997 — media barons, then as now, are a supply-chain risk.",
    "the world is not enough": "1999 — correct; the world is not a promoted claim.",
    "die another day": "2002 — the invisible car remains unverified.",
    "casino royale": "2006 — vesper's callsign is on the watch list. obviously.",
    "quantum of solace": "2008 — greene sold ecology and hoarded the water. see the margin note on emissions.",
    "skyfall": "2012 — the old ways, sometimes, are the ledger.",
    "spectre": "2015 — it was all one ledger, all along. uncomfortable.",
    "no time to die": "2021 — the desk outlives the agent. that is the point.",
  };
  var FILMS_ZH = {
    "第七號情報員": "dr no", "第七號情報員續集": "from russia with love",
    "金手指": "goldfinger", "霹靂彈": "thunderball", "雷霆谷": "you only live twice",
    "女王密使": "on her majestys secret service", "金剛鑽": "diamonds are forever",
    "生死關頭": "live and let die", "金槍人": "the man with the golden gun",
    "海底城": "the spy who loved me", "太空城": "moonraker", "最高機密": "for your eyes only",
    "八爪女": "octopussy", "雷霆殺機": "a view to a kill", "黎明生機": "the living daylights",
    "殺人執照": "licence to kill", "黃金眼": "goldeneye", "明日帝國": "tomorrow never dies",
    "縱橫天下": "die another day", "誰與爭鋒": "die another day", "黑日危機": "the world is not enough",
    "皇家夜總會": "casino royale", "皇家賭場": "casino royale",
    "量子危機": "quantum of solace", "空降危機": "skyfall", "惡魔四伏": "spectre",
    "生死交戰": "no time to die", "生死有時": "no time to die",
    "新鐵金剛之金眼睛": "goldeneye", "新鐵金剛之黑日危機": "the world is not enough",
    "新鐵金剛之量子殺機": "quantum of solace", "新鐵金剛之天幕殺機": "skyfall",
  };
  /* multi-word canon commands that don't fit the one-word dispatch */
  var CANON_WORDS = {
    "pay attention": { egg: "attentive", tkey: "term.payattention" },
    "pay attention 007": { egg: "attentive", tkey: "term.payattention" },
    "do you expect me to talk": { egg: "interrogated", tkey: "term.expectdie" },
    "licence": { egg: "licenced", tkey: "term.licence", burn: true },
    "licence to kill": { egg: "licenced", tkey: "term.licence", burn: true },
    "license to kill": { egg: "licenced", tkey: "term.licence", burn: true },
    "for your eyes only": { tkey: "term.eyesonly", open: "manifesto.html" },
    "eyes only": { tkey: "term.eyesonly", open: "manifesto.html" },
    "the meter": { tkey: "term.meterfile", open: "meter.html" },
    "day zero": { egg: "posture", tkey: "term.dayzero" },
    "axiom": { egg: "axiomatic", tkey: "term.axiom" },
    "axiomatic": { egg: "axiomatic", tkey: "term.axiom" },
    "0^0": { egg: "axiomatic", tkey: "term.axiom" },
    "421": { egg: "fraction", tkey: "term.aperture" },
    "3375": { egg: "fraction", tkey: "term.aperture" },
    "421/3375": { egg: "fraction", tkey: "term.aperture" },
    "universal exports": { egg: "frontoffice", tkey: "term.frontoffice" },
    "nobody does it better": { tkey: "term.nobodybetter" },
    "shaken not stirred": { egg: "mixologist", tkey: "term.martini" },
    "shaken, not stirred": { egg: "mixologist", tkey: "term.martini" },
    "the names bond": { egg: "namesake", tkey: "term.namesbond" },
    "the name is bond": { egg: "namesake", tkey: "term.namesbond" },
    "self destruct": { tkey: "term.selfdestruct" },
    "m": { tkey: "term.mcommittee" },
    "moneypenny": { tkey: "term.pennyflirt" },
    "q": { tkey: "term.qout", open: "ledger.html" },
    "columbus": { egg: "columbus", tkey: "term.columbus" },
    /* the 006 decode chain — staged via decodeChain() */
    "006": { chain: 1 },
    "scp-006": { chain: 2 },
    "scp 006": { chain: 2 },
    "astrakhan": { chain: 2 },
    "fountain": { chain: 2 },
    "the fountain": { chain: 2 },
    "fountain of youth": { chain: 2 },
    "scp-006-fr": { chain: 3 },
    "the butcher": { egg: "cleaver", pre: "term.butcher", chain: 3 },
    "le boucher": { egg: "cleaver", pre: "term.butcher", chain: 3 },
    "o5": { tkey: "term.o5" },
    "o5 council": { tkey: "term.o5" },
    "xi-12": { tkey: "term.xi12" },
    "006-xi-12": { tkey: "term.xi12" },
    "quad sealant": { tkey: "term.quadseal" },
    "quad-sealant": { tkey: "term.quadseal" },
    "class vi": { tkey: "term.classvi" },
    "chemical factory": { tkey: "term.chemfactory" },
    "first strike": { tkey: "term.firststrike", open: "declassified.html" },
    "zenodo": { tkey: "term.declassopen", open: "declassified.html" },
    "doi": { tkey: "term.declassopen", open: "declassified.html" },
    "declassified": { tkey: "term.declassopen", open: "declassified.html" },
    "the transmission": { tkey: "term.objopen", open: "object-006.html" },
    "object-006": { tkey: "term.objopen", open: "object-006.html" },
    "object 006": { tkey: "term.objopen", open: "object-006.html" },
    "ostf-006": { tkey: "term.objopen", open: "object-006.html" },
    "spec-006": { tkey: "term.brotheropen", open: "006.html" },
    "the brother": { tkey: "term.brotheropen", open: "006.html" },
    "brother file": { tkey: "term.brotheropen", open: "006.html" },
    /* the family shelf */
    "qstar-llm": { tkey: "term.qstarllm" },
    "qstar llm": { tkey: "term.qstarllm" },
    "zig-k3": { tkey: "term.zigk3" },
    "zig k3": { tkey: "term.zigk3" },
    "k3": { tkey: "term.zigk3" },
    "kimi": { tkey: "term.zigk3" },
    "digit": { tkey: "term.digit" },
  };
  /* staged 006 decode: 006 -> scp-006 -> scp-006-fr -> «Из России с любовью».
     Progress persists in state.decode006 (0..3). The -FR suffix is the payload. */
  function decodeChain(n) {
    state.decode006 = state.decode006 || 0;
    if (n === 1) {
      if (state.decode006 === 0) { state.decode006 = 1; save(); }
      return t("term.d006a");
    }
    if (n === 2) {
      state.decode006 = Math.max(state.decode006, 2); save();
      egg("fountainhead");
      return t("term.d006b");
    }
    if (state.decode006 >= 2) {
      state.decode006 = 3; save();
      egg("decoder");
      return t("term.d006c") + "\n" + seenTitle("from russia with love");
    }
    return t("term.d006locked");
  }
  function seenTitle(key) {
    state.titlesSeen = state.titlesSeen || [];
    if (state.titlesSeen.indexOf(key) < 0) {
      state.titlesSeen.push(key); save();
      if (state.titlesSeen.length >= 5) egg("marathon");
      if (state.titlesSeen.length >= Object.keys(FILMS).length) achieve("film_buff");
    }
    return FILMS[key] +
      "\n[" + state.titlesSeen.length + "/" + Object.keys(FILMS).length + " on the film roll]";
  }
  /* rotating cover stories for the sealed drawer */
  var DENIED_TAILS = ["denied.tail", "denied.tail2", "denied.tail3", "denied.tail4"];

  function eggTotal() { return Object.keys(EGGS).length; }
  function egg(id) {
    if (state.eggs.indexOf(id) >= 0) return;
    state.eggs.push(id);
    save();
    toast("EGG " + state.eggs.length + "/" + eggTotal() + " — " + EGGS[id], "egg");
    sfx.egg();
    if (state.eggs.length >= eggTotal()) achieve("completionist");
    award(7, "egg");
  }
  function vizSeen(name) {
    if (state.vizSeen.indexOf(name) >= 0) return;
    state.vizSeen.push(name); save();
    if (state.vizSeen.length >= 8) { egg("gallery"); achieve("projectionist"); }
  }

  function focus(win) {
    win.style.zIndex = ++zTop;
    document.querySelectorAll(".win").forEach(function (w) {
      w.classList.toggle("focused", w === win);
    });
    document.querySelectorAll(".task-item").forEach(function (t) {
      t.classList.toggle("active", t.dataset.wid === win.dataset.wid);
    });
  }

  function snapped(win) {
    win.classList.add("snapped");
    sfx.snap();
    var n = document.querySelectorAll(".win.snapped").length;
    if (n >= 2) egg("tiler");
  }
  function snapTo(win, mode) {
    var W = window.innerWidth, H = window.innerHeight - 42;
    win.dataset.maxed = "0";
    var hw = Math.floor(W / 2), hh = Math.floor(H / 2);
    if (mode === "max") { win.dataset.maxed = "1"; win.style.left = "0px"; win.style.top = "0px"; win.style.width = W + "px"; win.style.height = H + "px"; return; }
    win.classList.add("snapped");
    if (mode === "l") { win.style.left = "0px"; win.style.top = "0px"; win.style.width = hw + "px"; win.style.height = H + "px"; }
    if (mode === "r") { win.style.left = hw + "px"; win.style.top = "0px"; win.style.width = (W - hw) + "px"; win.style.height = H + "px"; }
    if (mode === "tl") { win.style.left = "0px"; win.style.top = "0px"; win.style.width = hw + "px"; win.style.height = hh + "px"; }
    if (mode === "tr") { win.style.left = hw + "px"; win.style.top = "0px"; win.style.width = (W - hw) + "px"; win.style.height = hh + "px"; }
    if (mode === "bl") { win.style.left = "0px"; win.style.top = hh + "px"; win.style.width = hw + "px"; win.style.height = (H - hh) + "px"; }
    if (mode === "br") { win.style.left = hw + "px"; win.style.top = hh + "px"; win.style.width = (W - hw) + "px"; win.style.height = (H - hh) + "px"; }
    sfx.snap();
    if (document.querySelectorAll(".win.snapped").length >= 2) egg("tiler");
  }

  function makeWindow(title, body) {
    var win = document.createElement("div");
    win.className = "win";
    win.dataset.wid = "w" + Date.now() + Math.floor(Math.random() * 999);
    var w = Math.min(920, window.innerWidth - 60);
    var h = Math.min(640, window.innerHeight - 110);
    win.style.width = w + "px";
    win.style.height = h + "px";
    win.style.left = 90 + cascade * 34 + "px";
    win.style.top = 40 + cascade * 28 + "px";
    cascade = (cascade + 1) % 8;

    var bar = document.createElement("div");
    bar.className = "win-titlebar";
    bar.innerHTML =
      '<span class="win-title">' + title + "</span>" +
      '<span class="win-btn win-min" title="shelve it">−</span>' +
      '<span class="win-btn win-max" title="fill the desk">□</span>' +
      '<span class="win-btn win-close" title="file it">×</span>';
    win.appendChild(bar);

    var bodyEl = document.createElement("div");
    bodyEl.className = "win-body";
    bodyEl.appendChild(body);
    win.appendChild(bodyEl);
    var grip = document.createElement("div");
    grip.className = "win-grip";
    win.appendChild(grip);
    desk.appendChild(win);

    /* born as glass: brief rise, then solid (iter 22) */
    win.classList.add("birth");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { win.classList.remove("birth"); });
    });

    function shelveWin() {
      win.classList.add("shelving");
      task.classList.remove("active");
      task.classList.add("minimized");
      setTimeout(function () { win.style.display = "none"; win.classList.remove("shelving"); }, 170);
      sfx.min();
    }
    function restoreWin() {
      win.style.display = "";
      win.classList.add("restoring");
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { win.classList.remove("restoring"); });
      });
      task.classList.remove("minimized");
      focus(win);
      sfx.open();
    }

    var task = document.createElement("div");
    task.className = "task-item";
    task.textContent = title;
    task.dataset.wid = win.dataset.wid;
    task.addEventListener("click", function () {
      if (win.style.display === "none") restoreWin();
      else if (win.classList.contains("focused")) shelveWin();
      else focus(win);
    });
    taskItems.appendChild(task);

    bar.querySelector(".win-close").addEventListener("click", function (e) {
      e.stopPropagation();
      win.classList.add("dying");
      sfx.close();
      setTimeout(function () {
        win.remove();
        task.remove();
        delete openWins[title];
      }, 170);
    });
    bar.querySelector(".win-min").addEventListener("click", function (e) {
      e.stopPropagation();
      shelveWin();
    });
    bar.querySelector(".win-max").addEventListener("click", function (e) {
      e.stopPropagation();
      if (win.dataset.maxed === "1") {
        ["left", "top", "width", "height"].forEach(function (p) {
          win.style[p] = win.dataset["prev_" + p];
        });
        win.dataset.maxed = "0";
      } else {
        ["left", "top", "width", "height"].forEach(function (p) {
          win.dataset["prev_" + p] = win.style[p];
        });
        win.style.left = "0px";
        win.style.top = "0px";
        win.style.width = window.innerWidth + "px";
        win.style.height = window.innerHeight - 42 + "px";
        win.dataset.maxed = "1";
      }
      focus(win);
    });

    win.addEventListener("pointerdown", function () { focus(win); });
    task.addEventListener("pointerdown", function () { focus(win); });

    /* resize via corner grip */
    grip.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (win.dataset.maxed === "1") return;
      var sw = e.clientX - win.offsetWidth;
      var sh = e.clientY - win.offsetHeight;
      function move(ev) {
        win.style.width = Math.max(240, ev.clientX - sw) + "px";
        win.style.height = Math.max(140, ev.clientY - sh) + "px";
      }
      function up() {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
      }
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });

    /* drag by titlebar */
    bar.addEventListener("pointerdown", function (e) {
      if (e.target.classList.contains("win-btn")) return;
      var sx = e.clientX - win.offsetLeft;
      var sy = e.clientY - win.offsetTop;
      function move(ev) {
        win.style.left = Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - sx)) + "px";
        win.style.top = Math.max(0, Math.min(window.innerHeight - 80, ev.clientY - sy)) + "px";
      }
      function up(ev) {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        /* edge-snap tiling: release near an edge, the desk files it neatly */
        var x = ev.clientX, y = ev.clientY, W = window.innerWidth, H = window.innerHeight - 42;
        win.dataset.maxed = "0";
        win.classList.remove("snapped"); delete win.dataset.snapSide;
        if (y < 12) {
          win.style.left = "0px"; win.style.top = "0px";
          win.style.width = W + "px"; win.style.height = H + "px";
          win.dataset.maxed = "1";
        } else if (x < 12 && y < H / 3) { /* top-left quarter */
          win.style.left = "0px"; win.style.top = "0px";
          win.style.width = Math.floor(W / 2) + "px"; win.style.height = Math.floor(H / 2) + "px"; snapped(win);
        } else if (x < 12 && y > 2 * H / 3) { /* bottom-left quarter */
          win.style.left = "0px"; win.style.top = Math.floor(H / 2) + "px";
          win.style.width = Math.floor(W / 2) + "px"; win.style.height = Math.ceil(H / 2) + "px"; snapped(win);
        } else if (x > W - 12 && y < H / 3) { /* top-right quarter */
          win.style.left = Math.floor(W / 2) + "px"; win.style.top = "0px";
          win.style.width = Math.ceil(W / 2) + "px"; win.style.height = Math.floor(H / 2) + "px"; snapped(win);
        } else if (x > W - 12 && y > 2 * H / 3) { /* bottom-right quarter */
          win.style.left = Math.floor(W / 2) + "px"; win.style.top = Math.floor(H / 2) + "px";
          win.style.width = Math.ceil(W / 2) + "px"; win.style.height = Math.ceil(H / 2) + "px"; snapped(win);
        } else if (x < 12) {
          win.style.left = "0px"; win.style.top = "0px";
          win.style.width = Math.floor(W / 2) + "px"; win.style.height = H + "px"; snapped(win);
        } else if (x > W - 12) {
          win.style.left = Math.floor(W / 2) + "px"; win.style.top = "0px";
          win.style.width = Math.floor(W / 2) + "px"; win.style.height = H + "px"; snapped(win);
        }
      }
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });

    openWins[title] = win;
    focus(win);
    sfx.open();
    return win;
  }

  var ALL_DOCS = ["public.html", "covert-en.html", "covert-zh.html", "terminology.html",
    "cover.html", "verified.html", "dossier.html", "claims.html", "input-audit.html",
    "expanded.html", "economics.html", "red-team.html", "governance.html",
    "ledger.html", "charter.html", "manifesto.html", "meter.html",
    "declassified.html", "object-006.html", "006.html"];

  function openDoc(path, title) {
    if (openWins[title]) { focus(openWins[title]); return; }
    var frame = document.createElement("iframe");
    frame.src = path;
    frame.title = title;
    makeWindow(title + " — " + path, frame);
    /* game: reading is the grind */
    firstOpen("doc:" + path, 10, "filed " + path);
    achieve("first_contact");
    if (path === "ledger.html") achieve("qclerk");
    if (path === "manifesto.html") achieve("reader_leak");
    if (path === "meter.html") egg("metered");
    if (path === "declassified.html") egg("sealbreaker");
    if (path === "object-006.html") egg("transmission");
    if (path === "006.html") egg("brotherhood");
    DOCS_READ[path] = true;
    if (["dossier.html", "claims.html", "input-audit.html"].every(function (p) { return DOCS_READ[p]; })) achieve("archivist");
    if (ALL_DOCS.every(function (p) { return DOCS_READ[p]; })) achieve("full_read");
    if (new Date().getHours() < 5) achieve("nightowl");
    paintBadges();
  }

  /* folder badges: the drawer labels admit what you've read (iter 32) */
  function paintBadges() {
    Object.keys(FS).forEach(function (k) {
      var el = iconRefs[k];
      if (!el) return;
      var n = FS[k].items.filter(function (i) { return DOCS_READ[i[0]]; }).length;
      el.querySelector(".sub").textContent =
        n === FS[k].items.length ? n + "/" + FS[k].items.length + " ✓" :
          n + "/" + FS[k].items.length + (state.lang === "zh" ? " 已歸檔" : " filed");
    });
  }

  function openFolder(key) {
    var folder = FS[key];
    var title = folder.label;
    if (openWins[title]) { focus(openWins[title]); return; }
    var list = document.createElement("div");
    list.className = "dirlist";
    folder.items.forEach(function (it) {
      var row = document.createElement("div");
      row.className = "dir-row";
      row.innerHTML =
        '<span class="g">≡</span><span class="n">' + it[1] +
        '</span><span class="d">' + it[2] + " · " + it[0] + "</span>";
      row.addEventListener("dblclick", function () { openDoc(it[0], it[1]); });
      row.addEventListener("click", function () { openDoc(it[0], it[1]); });
      list.appendChild(row);
    });
    var note = document.createElement("div");
    note.className = "dir-row";
    note.innerHTML = '<span class="g">·</span><span class="d">' +
      folder.items.length + " file(s) — single- or double-click to open</span>";
    list.appendChild(note);
    makeWindow(title, list);
    firstOpen("dir:" + key, 5, "opened " + key);
    if (state.dirsSeen.indexOf(key) < 0) {
      state.dirsSeen.push(key); save();
      if (state.dirsSeen.length >= Object.keys(FS).length) achieve("curator");
    }
  }

  function openConsole(title, text) {
    if (openWins[title]) { focus(openWins[title]); return; }
    var pre = document.createElement("pre");
    pre.style.margin = "0";
    pre.style.whiteSpace = "pre-wrap";
    pre.textContent = text;
    var wrap = document.createElement("div");
    wrap.className = "win-body console";
    wrap.appendChild(pre);
    var win = makeWindow(title, wrap);
    win.style.width = Math.min(560, window.innerWidth - 40) + "px";
    win.style.height = "auto";
    return win;
  }

  function openDenied() {
    var title = "7q.drawer — LOCKED";
    if (openWins[title]) { focus(openWins[title]); return; }
    var d = document.createElement("div");
    d.className = "denied";
    d.innerHTML =
      '<div class="big">' + t("denied.big") + "</div>" +
      "<p>" + t("denied.body") + "</p>" +
      '<span class="redbar"></span><span class="redbar"></span><span class="redbar"></span>' +
      "<p><small>" + t(DENIED_TAILS[(state.denialN = (state.denialN || 0) + 1) % DENIED_TAILS.length]) + "</small></p>";
    save();
    var win = makeWindow(title, d);
    win.style.width = "26rem";
    win.style.height = "24rem";
    firstOpen("denied", 1, "the audacity");
    achieve("denied");
    sfx.denied();
  }

  /* ---------- 7q: sealed drawer for all hands, Command suite for the flag ----------
     The Fleet Admiral's own desk opens 7q as the command surface:
     branch-request approvals, callsign grants, the issuer roster.
     Every other rank gets the cover story. */

  function open7q() {
    if (FANO_AUTH && FANO_AUTH.session.sk && FANO_AUTH.hasRole(FANO_AUTH.ROLES.fleet_admiral)) {
      openCommand(); return "cmd";
    }
    openDenied(); return "denied";
  }
  var deniedViaIcon = false;
  function deniedIcon() { deniedViaIcon = true; open7q(); }
  function deniedMenu() { if (deniedViaIcon) egg("askedtwice"); return open7q(); }

  function openCommand() {
    var title = "7q.drawer — COMMAND SUITE";
    if (openWins[title]) { focus(openWins[title]); return; }
    var d = document.createElement("div");
    d.className = "cmdsuite";
    var win = makeWindow(title, d);
    win.style.width = "36rem"; win.style.height = "38rem";
    renderCommand(d);
    egg("flagplot");
  }

  function renderCommand(root) {
    root.innerHTML = "";
    var A = FANO_AUTH, rec = A.loadRecord(), g = A.genesis();
    function sec(tl) {
      var s = document.createElement("div"); s.className = "cmd-sec";
      var h = document.createElement("div"); h.className = "cmd-sec-t"; h.textContent = tl;
      s.appendChild(h); root.appendChild(s); return s;
    }
    function row(txt) { var r = document.createElement("div"); r.className = "cmd-row"; r.textContent = txt; return r; }
    function btn(txt, fn) {
      var b = document.createElement("button"); b.className = "cmd-btn"; b.textContent = txt;
      b.addEventListener("click", fn); return b;
    }
    function inp(ph) {
      var i = document.createElement("input"); i.className = "cmd-in"; i.placeholder = ph; return i;
    }

    var head = sec("FLAG REGISTRY");
    head.appendChild(row("callsign: " + (rec ? rec.user : "—") + " · role: " + (A.ROLE_LABEL[A.session.role] || "?")));
    head.appendChild(row("fp: " + (A.fingerprint() || "—")));
    head.appendChild(row(g ? "genesis: " + g.callsign + " · sha256 " + (g.pk_sha256 || "").slice(0, 24) + "…" : "genesis: not on this desk"));
    head.appendChild(row("issuers: " + A.roster().length + " · callsign grants on file: " + Object.keys(A.grants()).length));

    var au = sec("FLAG AUTHENTICATOR — the Admiral's paper is the real thing");
    var aTok = document.createElement("textarea"); aTok.className = "cmd-in"; aTok.rows = 3;
    aTok.readOnly = true; aTok.placeholder = "the FANO-ROOT-v1 credential prints here — carry it anywhere";
    var aRow = document.createElement("div"); aRow.className = "cmd-row";
    aRow.appendChild(btn("ISSUE / REFRESH", function () {
      var c = A.issueCredential(null, 365);
      if (c && !c.error) { aTok.value = A.exportCredential() || ""; copyText(aTok.value, "authenticator minted + on clipboard — FANO-ROOT-v1"); }
      else toast(c && c.error === "not_flag_seat" ? "this desk does not hold the flag seat" : "mint refused", "sys");
    }));
    aRow.appendChild(btn("ROAMING PAPER", function () {
      var c = A.issueRoaming(30);
      if (c && !c.error) {
        aTok.value = c;
        copyText(c, "roaming paper on clipboard — unbound, 30 days. Paste it as the grant token at any desk's covenant.");
      } else toast("mint refused", "sys");
    }));
    aRow.appendChild(btn("EXPORT", function () {
      var t = A.exportCredential();
      if (t) { aTok.value = t; copyText(t, "authenticator exported + on clipboard"); }
      else toast("no authenticator on file — issue one first", "sys");
    }));
    au.appendChild(aRow); au.appendChild(aTok);
    var vRow = document.createElement("div"); vRow.className = "cmd-row";
    var vIn = document.createElement("textarea"); vIn.className = "cmd-in"; vIn.rows = 2;
    vIn.placeholder = "authenticate a presented token — verify the signature, not the story";
    vRow.appendChild(vIn);
    vRow.appendChild(btn("AUTHENTICATE", function () {
      var v = A.authenticate(vIn.value);
      toast(v ? "flag verified — " + v.callsign.toUpperCase() + " · sub fp " + (v.sub || "-").slice(0, 8).toUpperCase() + "…" +
        (v.tofu ? " · first contact (no local genesis)" : "") : "refused — credential failed verification", "sys");
      vIn.value = ""; renderCommand(root);
    }));
    au.appendChild(vRow);

    var rq = sec("BRANCH REQUESTS — the Admiral's signature moves a posting");
    var all = A.branchReqs(), any = false;
    Object.keys(all).forEach(function (pk) {
      var r = all[pk];
      if (r.status !== "pending") return;
      any = true;
      var valid = A.verifyRequest(r);
      var rr = row(r.callsign + " → " + r.branch.toUpperCase() +
        " · fp " + r.pk.slice(0, 8).toUpperCase() + "… · " +
        new Date(r.ts * 1000).toISOString().slice(0, 10) + (valid ? "" : " · sig-invalid"));
      rr.appendChild(document.createTextNode(" "));
      rr.appendChild(btn("APPROVE", function () {
        var a = A.assignBranch(pk, r.branch);
        toast(a && !a.error ?
          "assigned — " + r.branch + " · fp " + pk.slice(0, 8).toUpperCase() + "…" : "approval refused", "sys");
        renderCommand(root);
      }));
      rr.appendChild(btn("DENY", function () { A.denyBranch(pk); renderCommand(root); }));
      rq.appendChild(rr);
    });
    if (!any) rq.appendChild(row("no pending requests — the wire is quiet."));
    var imp = document.createElement("div"); imp.className = "cmd-row";
    var impIn = document.createElement("textarea"); impIn.className = "cmd-in"; impIn.rows = 2;
    impIn.placeholder = "import a request token — base64, signed by the requester's key";
    imp.appendChild(impIn);
    imp.appendChild(btn("IMPORT", function () {
      toast(A.importRequest(impIn.value) ?
        "request on file — signature verified" : "refused — token failed signature check", "sys");
      impIn.value = ""; renderCommand(root);
    }));
    rq.appendChild(imp);

    var gr = sec("CALLSIGN GRANTS — reserved names move by paper");
    var gRow = document.createElement("div"); gRow.className = "cmd-row";
    var gName = inp("reserved callsign");
    var gPk = inp("subject pk hex (optional — binds the grant)");
    gRow.appendChild(gName); gRow.appendChild(gPk);
    var gOut = document.createElement("textarea"); gOut.className = "cmd-in"; gOut.rows = 2;
    gOut.readOnly = true; gOut.placeholder = "issued grant token prints here";
    gRow.appendChild(btn("ISSUE", function () {
      var gg = A.grantCallsign(gName.value, gPk.value.trim() || null);
      if (gg && !gg.error) {
        gOut.value = A.exportGrant(gg.callsign) || "";
        toast("grant signed — '" + gg.callsign + "'", "sys");
      } else toast(gg && gg.error === "not_restricted" ? "not a reserved callsign" : "grant refused", "sys");
    }));
    gr.appendChild(gRow); gr.appendChild(gOut);

    var ro = sec("ISSUER ROSTER — keys trusted to certify elevated roles");
    A.roster().forEach(function (fp) { ro.appendChild(row("fp " + fp.slice(0, 12).toUpperCase() + "…")); });
    var rRow = document.createElement("div"); rRow.className = "cmd-row";
    var rIn = inp("issuer public key hex — adds to the roster");
    rRow.appendChild(rIn);
    rRow.appendChild(btn("ADD", function () {
      if (/^[0-9a-f]{64}$/i.test(rIn.value.trim())) {
        A.addIssuer(rIn.value.trim().toLowerCase()); toast("issuer rostered", "sys"); renderCommand(root);
      } else toast("not a pk hex", "sys");
    }));
    ro.appendChild(rRow);

    var note = document.createElement("div"); note.className = "cmd-foot";
    note.textContent = "everything here signs with the session key. tokens travel over any channel — the wire is dumb, the paper is real.";
    root.appendChild(note);
  }

  function paint7qLabel() {
    var el = iconRefs["7q.drawer"];
    if (!el) return;
    var adm = FANO_AUTH && FANO_AUTH.session.sk && FANO_AUTH.hasRole(FANO_AUTH.ROLES.fleet_admiral);
    var sub = el.querySelector(".sub");
    if (sub && sub.textContent !== (adm ? "COMMAND" : "SEALED")) sub.textContent = adm ? "COMMAND" : "SEALED";
  }

  /* ---------- admiralty suite: the flag's chart table ----------
     The Admiralty is a joint command: Naval Command runs the fleet's
     discipline and operations; Star Command runs space readiness and
     training. Signed personnel see the board — transparency is doctrine.
     Only the flag seat signs directives: FANO-DIR-v1, session-key paper. */

  var DIR_KEY = "fano1.directives";
  var ADM_NAVAL = ["admiralty", "constitutional", "ethics", "legal_financial", "security"];
  var ADM_STAR = ["human_academic", "research_ip", "specs", "strategy", "narrative"];
  var ORDER_001 =
    "ADMIRALTY ORDER 001 — The Admiralty Suite is constituted as a joint command. " +
    "Naval Command holds fleet operations, discipline, and the seal. Star Command " +
    "holds space readiness and training. All fleet directives require flag signature; " +
    "the wire is dumb, the paper is real.";

  function dirBytes(title, body, iss, ts) {
    return FANO_AUTH.verify ? new TextEncoder().encode(
      "FANO-DIR-v1\n" + title + "\n" + body + "\n" + iss + "\n" + ts) : null;
  }
  function directives() {
    try { return JSON.parse(localStorage.getItem(DIR_KEY)) || []; } catch (e) { return []; }
  }
  function saveDirectives(l) { try { localStorage.setItem(DIR_KEY, JSON.stringify(l)); } catch (e) {} }
  function verifyDirective(dv) {
    var A = FANO_AUTH;
    if (!dv || !dv.title || !dv.iss || !dv.sig || !dv.ts) return false;
    try { return A.verify(dirBytes(dv.title, dv.body, dv.iss, dv.ts), A.unhex(dv.sig), A.unhex(dv.iss)); }
    catch (e) { return false; }
  }

  function openAdmiralty() {
    var A = FANO_AUTH;
    if (!A || !A.session.sk) {
      toast("admiralty.suite — sign in; the board posts for personnel only", "sys");
      openDenied(); return;
    }
    var title = "admiralty.suite — BOARD OF ADMIRALTY";
    if (openWins[title]) { focus(openWins[title]); return; }
    var d = document.createElement("div");
    d.className = "cmdsuite";
    var win = makeWindow(title, d);
    win.style.width = "38rem"; win.style.height = "40rem";
    renderAdmiralty(d);
  }

  function renderAdmiralty(root) {
    root.innerHTML = "";
    var A = FANO_AUTH, rec = A.loadRecord();
    var flag = A.hasRole(A.ROLES.fleet_admiral);
    function sec(tl) {
      var s = document.createElement("div"); s.className = "cmd-sec";
      var h = document.createElement("div"); h.className = "cmd-sec-t"; h.textContent = tl;
      s.appendChild(h); root.appendChild(s); return s;
    }
    function row(txt) { var r = document.createElement("div"); r.className = "cmd-row"; r.textContent = txt; return r; }
    function btn(txt, fn) {
      var b = document.createElement("button"); b.className = "cmd-btn"; b.textContent = txt;
      b.addEventListener("click", fn); return b;
    }

    /* board: the office, then the two pillars with their branches */
    var bd = sec("BOARD OF ADMIRALTY — joint command");
    var fl = document.createElement("div"); fl.className = "adm-flag";
    fl.textContent = "FLEET ADMIRAL — PAUL P. RAMSEY · supreme command · directive sign-off";
    bd.appendChild(fl);
    var chart = document.createElement("div"); chart.className = "adm-chart";
    function pillar(name, mission, branches) {
      var p = document.createElement("div"); p.className = "adm-pillar";
      var h = document.createElement("div"); h.className = "adm-pillar-t"; h.textContent = name;
      var m = document.createElement("div"); m.className = "adm-branch"; m.textContent = mission;
      p.appendChild(h); p.appendChild(m);
      var assigns = A.branchAssigns ? A.branchAssigns() : {};
      branches.forEach(function (br) {
        var r = document.createElement("div"); r.className = "adm-branch";
        var occ = Object.keys(assigns).filter(function (pk) {
          var a = assigns[pk]; return a.branch === br && A.branchOf(pk);
        });
        r.innerHTML = "";
        r.appendChild(document.createTextNode(br.replace(/_/g, " ")));
        var o = document.createElement("span"); o.className = "occ";
        o.textContent = occ.length ? "  · " + occ.length + " billet" + (occ.length > 1 ? "s" : "") + " held" : "  · open billet";
        r.appendChild(o);
        p.appendChild(r);
      });
      return p;
    }
    chart.appendChild(pillar("NAVAL COMMAND", "fleet operations · discipline · the seal", ADM_NAVAL));
    chart.appendChild(pillar("STAR COMMAND", "space readiness · training", ADM_STAR));
    bd.appendChild(chart);
    bd.appendChild(row("viewer: " + (rec ? rec.user : "—") + " · " + (A.ROLE_LABEL[A.session.role] || "?") +
      (flag ? " · the flag seat is yours" : "")));

    /* star command readiness ledger: the academy's catalogue is the
       training pipeline — count what the fleet can teach */
    var rd = sec("STAR COMMAND — READINESS LEDGER");
    var rdRow = row("loading academy manifest…"); rd.appendChild(rdRow);
    fetch("assets/academy-manifest.json").then(function (r) { return r.json(); }).then(function (m) {
      var topics = {}, langs = {}, access = {};
      (m.lessons || []).forEach(function (l) {
        topics[l.topic] = (topics[l.topic] || 0) + 1;
        access[l.access] = (access[l.access] || 0) + 1;
        (l.language || []).forEach(function (x) { langs[x] = (langs[x] || 0) + 1; });
      });
      rdRow.textContent = (m.lesson_count || (m.lessons || []).length) + " lessons on the syllabus · " +
        Object.keys(topics).length + " topics · " + Object.keys(access).map(function (k) {
          return access[k] + " " + k; }).join(" · ");
      var top = Object.keys(topics).sort(function (a, b) { return topics[b] - topics[a]; }).slice(0, 6);
      rd.appendChild(row("largest schools: " + top.map(function (t) { return t + " (" + topics[t] + ")"; }).join(" · ")));
      rd.appendChild(row("languages: " + Object.keys(langs).map(function (k) { return k + " ×" + langs[k]; }).join(" · ")));
    }).catch(function () { rdRow.textContent = "academy manifest unavailable on this desk"; });

    /* standing order + the directive book */
    var st = sec("STANDING ORDER");
    var so = document.createElement("div"); so.className = "adm-sig";
    var body = document.createElement("div"); body.textContent = ORDER_001;
    var sig = document.createElement("div"); sig.className = "sig-line";
    sig.textContent = "— signed, Fleet Admiral Paul P. Ramsey";
    so.appendChild(body); so.appendChild(sig); st.appendChild(so);

    var dr = sec("DIRECTIVE BOOK — FANO-DIR-v1 · flag signature required");
    var list = directives();
    if (!list.length) dr.appendChild(row("no directives on the book — the pen is capped."));
    list.slice().reverse().forEach(function (dv) {
      var ok = verifyDirective(dv);
      var rr = document.createElement("div"); rr.className = "cmd-row adm-sig";
      var tb = document.createElement("div"); tb.textContent = dv.title + " — " + dv.body;
      var sb = document.createElement("div"); sb.className = "sig-line " + (ok ? "adm-billet-ok" : "adm-billet-bad");
      sb.textContent = (ok ? "sig verified" : "SIG INVALID") + " · iss " + dv.iss.slice(0, 12).toUpperCase() +
        "… · " + new Date(dv.ts * 1000).toISOString().slice(0, 19).replace("T", " ") + "z";
      rr.appendChild(tb); rr.appendChild(sb); dr.appendChild(rr);
    });
    if (flag) {
      var fRow = document.createElement("div"); fRow.className = "cmd-row";
      var tIn = document.createElement("input"); tIn.className = "cmd-in"; tIn.placeholder = "directive title";
      var bIn = document.createElement("input"); bIn.className = "cmd-in"; bIn.placeholder = "directive text — signed on issue";
      fRow.appendChild(tIn); fRow.appendChild(bIn);
      fRow.appendChild(btn("SIGN & ISSUE", function () {
        if (!tIn.value.trim() || !bIn.value.trim()) { toast("a directive needs a title and text", "sys"); return; }
        var fp0 = A.fingerprint(); // live issuer fp — the seat signs, canon names the officeholder
        var rec0 = A.loadRecord();
        var iss = rec0 ? rec0.pk : null;
        if (!iss) { toast("no key on this desk", "sys"); return; }
        var ts = Math.floor(Date.now() / 1000);
        var sg = A.sign(dirBytes(tIn.value.trim(), bIn.value.trim(), iss, ts), A.session.sk);
        if (!sg) { toast("signature refused", "sys"); return; }
        var l = directives();
        l.push({ title: tIn.value.trim(), body: bIn.value.trim(), iss: iss, ts: ts, sig: A.hex(sg) });
        saveDirectives(l);
        toast("directive signed — FANO-DIR-v1 · iss fp " + (fp0 || "").split(" ")[0] + "…", "sys");
        renderAdmiralty(root);
      }));
      dr.appendChild(fRow);
      var ex = document.createElement("div"); ex.className = "cmd-row";
      ex.appendChild(btn("EXPORT BOOK", function () {
        var l2 = directives();
        if (!l2.length) { toast("the book is empty", "sys"); return; }
        var w = makeWindow("directive book — export", (function () {
          var t = document.createElement("textarea"); t.className = "cmd-in"; t.rows = 12;
          t.readOnly = true; t.value = btoa(JSON.stringify(l2)); return t;
        })());
        w.style.width = "30rem"; w.style.height = "22rem";
      }));
      dr.appendChild(ex);
    } else {
      dr.appendChild(row("the ink is dry — directives issue from the flag seat only."));
    }

    /* ---------- GENESIS SEAT — the third signature ----------
       The fleet's trust root is a signed artifact on the bulletin
       board. The flag seat's enrolled key can countersign a staged
       genesis payload: the canonical bytes are signed here, on the
       desk, and the signature travels back by hand — like every
       proper countersignature. */
    var gs = sec("GENESIS SEAT — countersignature");
    if (flag) {
      gs.appendChild(row("flag key (ed25519 pk): " + rec.pk));
      gs.appendChild(btn("COPY PK", function () {
        copyText(rec.pk, "flag pk on the clipboard — hand it to the ledger officer");
      }));
      gs.appendChild(row("relay this pk to the ledger officer to stage your seat."));
      fetch("pending-genesis.json").then(function (r) {
        if (!r.ok) { gs.appendChild(row("no pending genesis staged — the ledger officer stages the payload first.")); return null; }
        return r.json();
      }).then(function (pg) {
        if (!pg || !pg.payload) return;
        var body = new TextEncoder().encode(JSON.stringify(pg.payload, null, 2));
        gs.appendChild(row("pending payload staged — " + pg.payload.members.length +
          " members · quorum " + pg.payload.quorum + " · spec " + pg.payload.spec));
        gs.appendChild(btn("COUNTERSIGN GENESIS", function () {
          var sg = A.sign(body, A.session.sk);
          if (!sg) { toast("signature refused", "sys"); return; }
          var w = makeWindow("genesis countersignature — relay to the ledger", (function () {
            var t = document.createElement("textarea"); t.className = "cmd-in"; t.rows = 8;
            t.readOnly = true;
            t.value = JSON.stringify({ name: "admiral", sig: A.hex(sg) });
            return t;
          })());
          w.style.width = "34rem"; w.style.height = "16rem";
          toast("genesis countersigned — relay the block to the ledger officer", "sys");
        }));
      }).catch(function () {});
    } else {
      gs.appendChild(row("the genesis seat posts to the flag seat only."));
    }

    var note = document.createElement("div"); note.className = "cmd-foot";
    note.textContent = "the board posts for all personnel — transparency is doctrine. " +
      "only the flag seat signs; the suite remembers every signature it is shown.";
    root.appendChild(note);
  }

  /* ---------- qstar desk-pet: 421 nodes, dreaming in i128 (iter 12) ---------- */

  var petGlance = null; /* toasts make it look up */
  var lastActive = Date.now();

  function openPet() {
    var title = "qstar.pet — the thinking cap";
    if (openWins[title]) { focus(openWins[title]); return; }
    var cv = document.createElement("canvas");
    cv.width = 560; cv.height = 460;
    cv.style.display = "block";
    cv.style.background = col("--desk-bg", "#0b0e13");
    var wrap = document.createElement("div");
    wrap.appendChild(cv);
    var win = makeWindow(title, wrap);
    win.style.width = "580px";
    win.style.height = "500px";

    /* 421 e0 nodes on a phyllotaxis spiral — the same lattice fano_tensor builds */
    var N = 421, nodes = [], cx = 280, cy = 215, R = 185;
    var GA = Math.PI * (3 - Math.sqrt(5)); /* golden angle */
    for (var i = 0; i < N; i++) {
      var r = R * Math.sqrt(i / N);
      var a = i * GA;
      nodes.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a),
        ph: Math.random() * Math.PI * 2, th: 0 });
    }
    var pulses = [], raf;
    cv.addEventListener("pointerdown", function (e) {
      var b = cv.getBoundingClientRect();
      pulses.push({ x: e.clientX - b.left, y: e.clientY - b.top, t: 0 });
      firstOpen("pet:think", 3, "it noticed you");
    });
    cv.addEventListener("dblclick", function (e) {
      /* a firm knock gets a standing wave — two ripples, out of phase */
      var b = cv.getBoundingClientRect();
      pulses.push({ x: e.clientX - b.left, y: e.clientY - b.top, t: 0 });
      pulses.push({ x: e.clientX - b.left, y: e.clientY - b.top, t: -14 });
      egg("standingwave");
    });
    petGlance = function () {
      /* toasts make it look up — a ripple from the taskbar edge */
      pulses.push({ x: 280, y: 430, t: 0 });
    };
    function frame(t) {
      if (!win.isConnected) { cancelAnimationFrame(raf); if (petGlance) petGlance = null; return; }
      var ctx = cv.getContext("2d");
      ctx.clearRect(0, 0, cv.width, cv.height);
      /* v2 moods: it wanders, it tires, it dreams (iter 36) */
      var idleFor = (Date.now() - lastActive) / 1000;
      var asleep = idleFor > 45;
      var wx = asleep ? 0 : Math.sin(t / 9000) * 14;
      var wy = asleep ? 0 : Math.cos(t / 11000) * 9;
      var breathe = 1 + (asleep ? 0.008 : 0.02) * Math.sin(t / (asleep ? 3200 : 1400));
      var baseA = asleep ? 0.12 : 0.45;
      for (var i = 0; i < N; i++) {
        var n = nodes[i];
        var x = cx + wx + (n.x - cx) * breathe, y = cy + wy + (n.y - cy) * breathe;
        var tw = baseA + baseA * Math.sin(t / 900 + n.ph);
        for (var p = 0; p < pulses.length; p++) {
          var pu = pulses[p];
          if (pu.t < 0) continue;
          var d = Math.hypot(n.x - pu.x, n.y - pu.y);
          var w = Math.abs(d - pu.t * 4);
          if (w < 40) tw = Math.min(1, tw + (1 - w / 40));
        }
        ctx.fillStyle = "rgba(" + col("--acc-rgb", "79,195,232") + "," + (0.15 + 0.85 * tw) + ")";
        ctx.fillRect(x, y, 2.2, 2.2);
      }
      for (var q = pulses.length - 1; q >= 0; q--) if (++pulses[q].t > 90) pulses.splice(q, 1);
      ctx.fillStyle = "rgba(" + col("--dim-rgb", "93,107,120") + ",.9)";
      ctx.font = "11px Courier New";
      ctx.fillText(asleep
        ? "421 nodes · dormant — it dreams of charge curves"
        : pulses.length ? "421 nodes · attending"
        : "421 nodes · 8 channels · i128 — alive enough to count", 16, 444);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  function openSelfDestruct() {
    var win = openConsole(
      "self_destruct.txt",
      "This file will self-destruct.\n\nUnlike the cartridge, which is " +
      "designed to burn slowly — the document burns; the carbide burns " +
      "at half a litre a minute.\n\nThat is the whole product."
    );
    if (!win) return;
    achieve("pyro");
    setTimeout(function () {
      win.style.transition = "opacity 2.5s ease, filter 2.5s ease";
      win.style.opacity = "0";
      win.style.filter = "blur(6px) sepia(1) hue-rotate(-30deg)";
      setTimeout(function () {
        var t = document.querySelector('.task-item[data-wid="' + win.dataset.wid + '"]');
        win.remove();
        if (t) t.remove();
        delete openWins["self_destruct.txt"];
      }, 2600);
    }, 5000);
  }

  function openAbout() {
    openConsole(
      "about_fano1.txt",
      "FANO-1 WORKSTATION — dossier shell\n" +
      "────────────────────────────────\n" +
      "host:     OSTF Fleet Command\n" +
      "asset:    SPEC-007 \"Ice Cream Tube\"\n" +
      "release:  public v1.4.0\n" +
      "harness:  92 tests green (86 primary + 6 toys)\n" +
      "baseline: sha256 bcb81b78ebeab9… intact\n" +
      "shell:    integer-only beneath, f64 in the sidecar\n" +
      "drawer:   7q — locked, by design\n" +
      "────────────────────────────────\n" +
      "Certified to half an ulp. Do try to return it in one piece."
    );
  }

  /* ---------- governed Ollama bridge ---------- */
  var GOV_CFG = { url: "http://127.0.0.1:8765", provider: "local", model: "", token: "" };
  function govFetch(path, options) {
    options = options || {}; options.headers = Object.assign({}, options.headers || {},
      { "Authorization": "Bearer " + GOV_CFG.token, "Content-Type": "application/json" });
    return fetch(GOV_CFG.url.replace(/\/$/, "") + path, options);
  }
  function openGovProvider() {
    var title = "governance.ai — provider boundary";
    if (openWins[title]) { focus(openWins[title]); return; }
    var box = document.createElement("div"); box.className = "win-body gov-pane";
    box.innerHTML = "<p><strong>GOVERNED AI PROVIDER</strong></p>" +
      "<p><small>FANO does not call remote Ollama directly. This local bridge applies clearance, HRIS, evidence, and audit gates before forwarding.</small></p>";
    function field(label, value, type) { var p=document.createElement("p"), l=document.createElement("label"), i=document.createElement("input"); l.textContent=label; i.type=type||"text"; i.value=value||""; i.style.cssText="width:100%;font-family:monospace;background:transparent;color:inherit;border:1px solid var(--rule);padding:.35rem"; p.appendChild(l); p.appendChild(document.createElement("br")); p.appendChild(i); box.appendChild(p); return i; }
    var url = field("BRIDGE URL", GOV_CFG.url), token = field("BRIDGE TOKEN", GOV_CFG.token, "password"), model = field("MODEL", GOV_CFG.model);
    var provider = document.createElement("select"); provider.innerHTML = "<option value=\"local\">local · 127.0.0.1:11434</option><option value=\"qstar\">Qstar · 127.0.0.1:11435</option><option value=\"remote\">remote · 192.168.12.210:11434</option>"; provider.value=GOV_CFG.provider; box.appendChild(provider);
    var status = document.createElement("pre"); status.style.whiteSpace="pre-wrap"; box.appendChild(status);
    var actions = document.createElement("p");
    function button(text, fn) { var b=document.createElement("button"); b.textContent=text; b.className="cmd-btn"; b.addEventListener("click",fn); actions.appendChild(b); return b; }
    button("DISCOVER MODELS", function () {
      GOV_CFG.url=url.value; GOV_CFG.token=token.value; GOV_CFG.provider=provider.value; status.textContent="discovering…";
      govFetch("/models").then(function(r){return r.json();}).then(function(j){
        var inv=j[GOV_CFG.provider]; status.textContent=inv ? JSON.stringify(inv.models,null,2) : JSON.stringify(j,null,2);
        if (inv && inv.models && inv.models.length && !model.value) {
          var usable = inv.models.filter(function (m) { return !/embed/i.test(m.name); });
          model.value = (usable[0] || inv.models[0]).name;
        }
      }).catch(function(e){status.textContent="bridge unavailable — "+e;});
    });
    button("USE FOR ASK", function () { GOV_CFG.url=url.value; GOV_CFG.token=token.value; GOV_CFG.provider=provider.value; GOV_CFG.model=model.value; status.textContent=GOV_CFG.model ? "provider armed — ask uses the governed boundary" : "choose a discovered model first"; });
    button("RECENT AUDIT", function () { GOV_CFG.url=url.value; GOV_CFG.token=token.value; govFetch("/audit").then(function(r){return r.json();}).then(function(j){status.textContent=JSON.stringify(j,null,2);}).catch(function(e){status.textContent="audit unavailable — "+e;}); });
    button("CAPABILITY REGISTRY", function () { fetch("assets/capability-registry.json").then(function(r){return r.json();}).then(function(j){status.textContent=JSON.stringify(j,null,2);}).catch(function(e){status.textContent="registry unavailable — "+e;}); });
    button("SALVAGE REGISTRY", function () {
      status.textContent="loading machine-wide salvage registry…";
      fetch("assets/zig-capability-registry.json").then(function(r){return r.json();}).then(function(j){
        var lines=[];
        lines.push("machine-wide zig salvage — "+j.capability_count+" capabilities");
        lines.push("");
        lines.push("governance coverage by category:");
        var cov=j.governance_coverage||{};
        Object.keys(cov).forEach(function(k){ if(k!==".archive"){ var c=cov[k]; lines.push("  "+k+": "+c.covered+" covered · "+c.partial+" partial · "+c.gap+" gap / "+c.documents+" docs"); } });
        lines.push("");
        lines.push("lifecycle:");
        Object.keys(j.by_lifecycle||{}).forEach(function(k){ lines.push("  "+k+": "+j.by_lifecycle[k]); });
        lines.push("");
        lines.push("domains:");
        Object.keys(j.by_domain||{}).forEach(function(k){ lines.push("  "+k+": "+j.by_domain[k]); });
        lines.push("");
        lines.push("evidence states:");
        Object.keys(j.by_evidence_state||{}).forEach(function(k){ lines.push("  "+k+": "+j.by_evidence_state[k]); });
        status.textContent=lines.join("\n");
      }).catch(function(e){status.textContent="salvage registry unavailable — "+e;});
    });
    button("SPEC REGISTRY", function () {
      status.textContent="loading canonical spec registry…";
      fetch("assets/spec-registry.json").then(function(r){return r.json();}).then(function(j){
        var lines=["canonical registry — "+j.spec_count+" specs · audit seq "+j.audit_sequence,""];
        j.specs.forEach(function(s){
          lines.push("  "+s.name+"  ["+s.status+"]"+(s.normative?" normative":"")+"  v"+s.version);
        });
        status.textContent=lines.join("\n");
      }).catch(function(e){status.textContent="spec registry unavailable — "+e;});
    });
    box.appendChild(actions); makeWindow(title, box);
  }

  function openAcademy() {
    var title = "academy.os — public curriculum";
    if (openWins[title]) { focus(openWins[title]); return; }
    var box = document.createElement("div"); box.className = "win-body academy-pane";
    box.innerHTML = "<p><strong>ACADEMY.OS</strong> <small>— source-linked public curriculum</small></p><p><small>Ollama may tutor, but competencies and credentials remain deterministic and human-reviewed.</small></p>";
    var list = document.createElement("div"), detail = document.createElement("pre"); list.className="academy-list"; detail.style.whiteSpace="pre-wrap"; box.appendChild(list); box.appendChild(detail); makeWindow(title, box);
    fetch("assets/academy-manifest.json").then(function(r){return r.json();}).then(function(m){
      detail.textContent = m.lesson_count + " lessons filed — choose a lesson.";
      m.lessons.forEach(function(lesson){ var b=document.createElement("button"); b.className="cmd-btn"; b.textContent=lesson.topic+" · "+lesson.title; b.addEventListener("click",function(){ detail.textContent=lesson.title+"\\n\\n"+lesson.outcome+"\\n\\nevidence: "+lesson.evidence+"\\nassessment: "+lesson.assessment+"\\nsource: "+lesson.source; }); list.appendChild(b); });
    }).catch(function(e){ detail.textContent="academy manifest unavailable — "+e; });
  }

  function openScience() {
    var title = "q-branch — science inventory";
    if (openWins[title]) { focus(openWins[title]); return; }
    var box = document.createElement("div"); box.className = "win-body academy-pane";
    box.innerHTML = "<p><strong>Q BRANCH — SCIENCE INVENTORY</strong> <small>— what the fleet can actually compute</small></p>" +
      "<p><small>Labels are honest: VERIFIED IN HOUSE · PATTERN ONLY · UNBUILT · FICTION DRAWER.</small></p>";
    var filters = document.createElement("p"), list = document.createElement("div"),
        detail = document.createElement("pre");
    list.className = "academy-list"; detail.style.whiteSpace = "pre-wrap";
    box.appendChild(filters); box.appendChild(list); box.appendChild(detail);
    makeWindow(title, box);
    fetch("assets/science-inventory.json").then(function (r) { return r.json(); }).then(function (inv) {
      var counts = inv.verdict_counts || {};
      /* the honest floor is the codex — count it for the cartographer */
      state.anomsTotal = inv.terms.filter(function (t) { return FLOOR_VERDICTS[t.verdict]; }).length;
      detail.textContent = inv.term_count + " corpus terms filed\n" +
        Object.keys(counts).map(function (k) { return "  " + k + ": " + counts[k]; }).join("\n") +
        "\n\nanomalies on file: " + state.anomsTotal +
        "  ·  inspected: " + state.anoms.length +
        "\n\nchoose a term.";
      var modes = ["all", "modeled", "sheraton_modeled", "mappable_verified", "gap", "speculative"];
      modes.forEach(function (m) {
        var b = document.createElement("button"); b.className = "cmd-btn";
        b.textContent = m.toUpperCase();
        b.addEventListener("click", function () {
          list.innerHTML = "";
          inv.terms.filter(function (t) { return m === "all" || t.verdict === m; })
            .forEach(function (t) {
              var tb = document.createElement("button"); tb.className = "cmd-btn";
              tb.textContent = t.label + " · " + t.term;
              tb.addEventListener("click", function () {
                anomalySeen(t);
                var lore = ANOMALY_LORE[t.term] || (FLOOR_VERDICTS[t.verdict]
                  ? (t.verdict === "speculative_mapped" ? MAPPED_FALLBACK : ANOMALY_FALLBACK)
                  : null);
                detail.textContent = t.term + "\n\n" + t.label + " (" + t.verdict + ")" +
                  "\ngrade: " + t.grade +
                  (t.spec007_sections.length ? "\nspec-007 sections: " + t.spec007_sections.join(", ") : "") +
                  "\nsource: " + t.source +
                  (t.unbuilt ? "\n\n— UNBUILT: on the Q Branch work order, not yet a gadget." : "") +
                  (lore ? "\n\n— ANOMALY CODEX —\n" + lore +
                    "\n(inspected " + state.anoms.length + " of " + state.anomsTotal + " anomalies)" : "");
              });
              list.appendChild(tb);
            });
        });
        filters.appendChild(b);
      });
    }).catch(function (e) { detail.textContent = "science inventory unavailable — " + e; });
  }

  /* ---------- terminal: canon as commands (iter 13) ---------- */

  var TERM_CMDS = ["help", "ls", "open", "cat", "about", "sha", "tests", "xp",
    "manual", "export", "import", "7q", "admiralty", "pet", "quplink", "family", "rations", "comms", "ask", "theme",
    "credential", "auth", "provider", "academy", "science", "gate", "codex",
    "lang", "unlock", "rekey", "burn", "grant", "grants", "branch", "request-branch",
    "export-desk", "import-desk",
    "sysmon", "viz", "palette", "mute", "unmute", "echo", "whoami", "zulu",
    "xyzzy", "look", "open sesame", "sudo", "clear", "lock"];

  var TERM_HELP = [
    "commands:",
    "  help            this list",
    "  ls [dir]        list dossier files (L0_PUBLIC, L1_TRUSTED, L2_FILE, L3_OPS, Q_BRANCH)",
    "  open <page>     open a dossier page (e.g. open dossier.html)",
    "  cat covenant    the pledge",
    "  about           sysinfo",
    "  sha             baseline integrity check",
    "  tests           harness status",
    "  xp              clearance and field record",
    "  theme [name]    station · crt · whitehall · spectre",
    "  sysmon          live desk monitor (fps, wasm, lattice)",
    "  viz [name]      open a render pane (sankey, e8, smith, claims …)",
    "  palette         Ctrl+K — the fast drawer",
    "  mute / unmute   the desk's voice",
    "  echo <s>        the desk repeats you",
    "  whoami          the desk answers honestly",
    "  zulu            the clock, verbatim",
    "  7q              request drawer access",
    "  admiralty       the board of admiralty — org, readiness ledger, directive book",
    "  credential      the flag's authenticator · credential verify <token> checks presented paper",
    "  pet             summon the thinking cap",
    "  manual          field manual (service record)",
    "  export          print save code · import <code> restores it",
    "  ask <q>         query the governed Ollama boundary (configure 'provider' first)",
    "  provider        configure local/remote Ollama discovery + bridge token",
    "  academy         open source-linked public curriculum",
    "  science         Q's lab notebook — what the fleet can compute",
    "  codex           the anomalies annex — cold cases and fiction files",
    "  quplink         open the sandbox uplink",
    "  family          the sibling projects — fleet registry",
    "  lang [en|zh]    the desk's second tongue",
    "  rations         dock the sister platform",
    "  comms           comms.os — wire, messenger, drops, tradecraft",
    "  unlock          warm the keystore (passphrase)",
    "  rekey           re-issue your role certificate",
    "  grant <cs> [pk] issue a reserved-callsign grant (STATION-CHIEF+)",
    "  grants          list issued callsign grants",
    "  request-branch <div>  file a branch request — Fleet Admiral approves in 7q",
    "  branch          show your branch assignment",
    "  export-desk     signed desk-transfer token — carry this desk to another machine",
    "  import-desk <tok>  accept a desk-transfer token on an unfounded desk",
    "  burn            destroy the keystore — next boot asks for the pledge",
    "  clear           wipe the scroll",
    "  lock            sign out",
    "  ↑/↓ history · Tab completes",
  ].join("\n");

  function termExec(cmd, print) {
    var parts = cmd.trim().split(/\s+/);
    var c = parts[0].toLowerCase();
    var argRaw = parts.slice(1).join(" ");
    var arg = argRaw.toLowerCase();
    var full = cmd.trim().toLowerCase().replace(/\s+/g, " ");
    switch (c) {
      case "help": return TERM_HELP;
      case "ls":
        if (!arg) {
          return Object.keys(FS).join("   ") +
            "\ncovenant.txt  about_fano1.txt  qstar.pet  self_destruct.txt  7q.drawer [SEALED]";
        }
        var key = arg.toUpperCase().replace(/\/$/, "");
        if (!FS[key]) return t("term.nodrawer", arg);
        return FS[key].items.map(function (i) { return i[0] + "  — " + i[1]; }).join("\n");
      case "open": {
        var hit = ALL_DOCS.find(function (p) { return p === arg || p.indexOf(arg) === 0; }) ||
                  ALL_DOCS.find(function (p) { return p.indexOf(arg) >= 0; });
        if (!hit) return t("term.nofile", arg);
        var title = hit.replace(".html", "");
        openDoc(hit, title);
        return t("term.opening", hit);
      }
      case "cat":
        if (arg === "covenant") {
          var rec = FANO_AUTH && FANO_AUTH.loadRecord();
          if (!rec) return COVENANT;
          var g0c = FANO_AUTH.genesis && FANO_AUTH.genesis();
          return COVENANT + "\n\n— countersigned by this device:\n" +
            "  callsign: " + rec.user + "\n" +
            "  key fp:   " + FANO_AUTH.fingerprint() + "\n" +
            "  sig:      " + rec.covenant_sig.slice(0, 48) + "…\n" +
            "  sha256:   " + rec.covenant_sha256.slice(0, 32) + "…\n" +
            "  role:     " + (FANO_AUTH.ROLE_LABEL[rec.cert.role] || "CADET") +
            " · expires " + new Date(rec.cert.exp * 1000).toISOString().slice(0, 10) +
            (g0c ? "\n  genesis:  " + (g0c.pk_sha256 || "").slice(0, 32) + "…" +
              (g0c.pk === rec.pk ? " ← this key founded the desk" : "") : "");
        }
        if (arg === "about") return "run 'about' instead — it has a window";
        return "cat: " + arg + ": try covenant";
      case "about": openAbout(); return "sysinfo windowed.";
      case "sha": return "bcb81b78ebeab9e3762a806788a0c4c1bd3bbd1e8a7b9339030037efab6367b4\nspec-007.md — UNCHANGED. the baseline holds.";
      case "tests": return "zig: 8+18+15+21+12+12 = 86 primary … GREEN\nq_toys: 6 … GREEN\ntotal: 92 verified operations";
      case "xp":
        return "clearance: L" + clearance() + " (" + state.xp + "xp)" +
          "\nachievements: " + state.achievements.length + "/" + Object.keys(ACHIEVEMENTS).length +
          "\neggs: " + state.eggs.length + "/" + eggTotal();
      case "manual": openManual(); return t("term.manual");
      case "export": return btoa(JSON.stringify(state)) + "\n— carry this code; 'import <code>' on any desk restores you";
      case "export-desk":
        if (!FANO_AUTH.session.sk) return "export-desk: unlock first — the desk signs its own transfer";
        var dtok = FANO_AUTH.exportDesk();
        if (dtok) copyText(dtok, "desk token on the clipboard");
        return dtok ? dtok + "\n— FANO-DESK-v1 · the keystore stays wrapped; 'import-desk <token>' on an unfounded desk"
                    : "export-desk: refused — no record to carry";
      case "import-desk":
        if (!argRaw) return "import-desk: needs a desk token";
        var di = FANO_AUTH.importDesk(argRaw.replace(/\s/g, ""));
        if (di.error === "desk_founded") return "import-desk: this desk is already founded — burn first";
        if (di.error === "sig_invalid") return "import-desk: refused — token not signed by the key it carries";
        if (di.error) return "import-desk: not a FANO-DESK-v1 token";
        return "desk received — " + di.user.toUpperCase() + (di.founded ? " · founding carried" : "") +
          "\nunlock with your credential — the desk is yours";
      case "import":
        if (!argRaw) return "import: needs a save code";
        try {
          var back = JSON.parse(atob(argRaw.replace(/\s/g, "")));
          if (typeof back.xp !== "number") return "import: not a field record";
          state = Object.assign(state, back);
          save(); paintClearance();
          setTheme(state.theme in THEMES ? state.theme : "station");
          egg("importer");
          return "record restored — L" + clearance() + " · " + state.xp + "xp · " +
            state.eggs.length + " eggs · " + state.achievements.length + " achievements";
        } catch (e) { return "import: the code didn't survive transit"; }
      case "7q": return deniedMenu() === "cmd" ? t("term.cmdopen") : t("term.denied");
      case "admiralty": openAdmiralty(); return "the board convenes — naval command · star command.";
      case "pet": openPet(); return t("term.pet");
      case "quplink": if (window.QUPLINK) { window.QUPLINK.open(); return t("term.uplink"); } return "quplink: module absent";
      case "family":
      case "fleet":
        if (window.QUPLINK) { window.QUPLINK.open(); egg("genealogist"); return t("term.familyopen"); }
        return "family: quplink module absent";
      case "rations": openDoc("apps/rations/quine.html", "rations.os"); return t("term.rations");
      case "comms": if (window.FANO_COMMS) { window.FANO_COMMS.open(); return "comms.os live — the tradecraft drawer slides open."; } return "comms: module absent";
      case "theme":
        if (!arg) return t("term.liavry.cur") + state.theme + "\n" +
          Object.keys(THEMES).filter(function (k) {
            return !THEMES[k].hidden || state.eggs.indexOf("satellite") >= 0;
          }).map(function (k) {
            return "  " + k + (state.theme === k ? " ←" : "  ") + " — " + THEMES[k].desc;
          }).join("\n");
        if (!THEMES[arg] || (THEMES[arg].hidden && state.eggs.indexOf("satellite") < 0))
          return t("term.nolivery", arg);
        setTheme(arg); achieve("wardrobe");
        return t("term.liavry.cur") + THEMES[arg].label;
      case "sysmon": openSysmon(); return t("term.sysmon");
      case "viz":
        if (!window.QUVIZ) return "viz: deck absent";
        if (!arg) { window.QUVIZ.vizPaneList(); return t("term.vizpick"); }
        return window.QUVIZ.openViz(arg) ? t("term.vizok", arg) : t("term.noviz", arg);
      case "palette": openPalette(); return t("term.fastdrawer");
      case "mute": state.muted = true; save(); return t("term.muted");
      case "unmute": state.muted = false; save(); sfx.chime(); return t("term.unmuted");
      case "echo": return argRaw || "echo: echo: echo:";
      case "whoami": {
        var rec = FANO_AUTH && FANO_AUTH.loadRecord();
        if (!rec) return "nobody signed in — that should not be possible.";
        var warm = FANO_AUTH.session.sk ? "keystore warm" : "keystore cold — run 'unlock'";
        var g0 = FANO_AUTH.genesis && FANO_AUTH.genesis();
        var gline = (g0 && g0.pk === rec.pk)
          ? "\ngenesis: sha256 " + (g0.pk_sha256 || "").slice(0, 24) + "… — this desk's founding key is yours"
          : (g0 ? "\ngenesis: sha256 " + (g0.pk_sha256 || "").slice(0, 24) + "… — founded by another key" : "");
        var br = FANO_AUTH.branchOf ? FANO_AUTH.branchOf(rec.pk) : null;
        var auLine = "";
        if (FANO_AUTH.verifyCredential) {
          var auG = (FANO_AUTH.grants() || {})[rec.user];
          var auV = auG && auG.root ? FANO_AUTH.verifyCredential(auG.root) : null;
          if (auV) auLine = "\nauthenticator: FANO-ROOT-v1 verified · expires " +
            new Date(auV.exp * 1000).toISOString().slice(0, 10);
        }
        return t("term.whoami", clearance(), state.eggs.length) +
          "\ncallsign: " + rec.user + " · role: " + (FANO_AUTH.ROLE_LABEL[FANO_AUTH.session.role] || "?") +
          "\nkey fp: " + FANO_AUTH.fingerprint() + " · " + warm + gline +
          (br ? "\nbranch: " + br.branch.toUpperCase() + " — assigned by fp " + br.iss.slice(0, 8).toUpperCase() + "…" : "") +
          auLine;
      }
      case "credential":
      case "auth": {
        if (!FANO_AUTH || !FANO_AUTH.loadRecord()) return "no record on this desk.";
        if (arg === "verify" || arg === "authenticate") {
          var tok = argRaw.replace(/^(verify|authenticate)\s+/i, "").trim();
          if (!tok) return "credential verify: needs a token";
          var av = FANO_AUTH.authenticate && FANO_AUTH.authenticate(tok);
          return av ? "FLAG VERIFIED — " + av.callsign.toUpperCase() + " holds FLEET-ADMIRAL\n" +
            "  subject fp: " + (av.sub || "-").slice(0, 16).toUpperCase() + "\n" +
            "  issuer fp:  " + av.iss.slice(0, 16).toUpperCase() + " · expires " +
            new Date(av.exp * 1000).toISOString().slice(0, 10) +
            (av.tofu ? "\n  note: no local genesis — first-contact trust" : "") :
            "refused — the credential failed verification. the paper was not real.";
        }
        if (!FANO_AUTH.session.sk) return "credential: unlock first — cold keystore cannot mint";
        if (FANO_AUTH.isPinned && FANO_AUTH.isPinned(FANO_AUTH.loadRecord().user)) {
          var mine = FANO_AUTH.exportCredential && FANO_AUTH.exportCredential();
          if (!mine && FANO_AUTH.issueCredential) {
            FANO_AUTH.issueCredential(null, 365); mine = FANO_AUTH.exportCredential();
          }
          return mine ? "FANO-ROOT-v1 — the flag's authenticator. verify it anywhere:\n" + mine
            : "credential: the mint declined";
        }
        return "credential: authenticators are flag-seat only. your paper is the callsign grant — 'grant' tokens are yours.";
      }
      case "branch": {
        if (!FANO_AUTH || !FANO_AUTH.loadRecord()) return "no record on this desk.";
        var asg = FANO_AUTH.branchOf ? FANO_AUTH.branchOf(FANO_AUTH.loadRecord().pk) : null;
        return asg ?
          "branch: " + asg.branch.toUpperCase() + " — assigned by fp " + asg.iss.slice(0, 8).toUpperCase() + "…" :
          "no branch assignment on file — 'request-branch <division>' files one.";
      }
      case "request-branch":
      case "request": {
        if (!FANO_AUTH) return "auth module absent";
        if (!FANO_AUTH.session.sk) return "request-branch: unlock first — cold keystore cannot sign";
        var b = arg.replace(/\s+/g, "_");
        if (FANO_AUTH.BRANCHES.indexOf(b) < 0)
          return "request-branch: choose one —\n  " + FANO_AUTH.BRANCHES.join("  ");
        var rq = FANO_AUTH.requestBranch(b);
        if (!rq || rq.error) return "request-branch: refused — the mint declined";
        return "branch request signed — " + b.toUpperCase() + " pending Fleet Admiral approval.\n" +
          "token: " + (FANO_AUTH.exportRequest(rq.pk) || "-") +
          "\ncarry it over comms.os or any channel — approvals land in 7q.";
      }
      case "unlock": {
        if (!FANO_AUTH) return "auth module absent";
        if (FANO_AUTH.session.sk) return "keystore already warm.";
        unlockPrompt(); return "the keystore waits for your passphrase.";
      }
      case "burn": {
        if (!FANO_AUTH) return "auth module absent";
        if (arg === "genesis") {
          FANO_AUTH.burn("genesis");
          return "keystore destroyed — and the founding record with it.\nthis desk is unfounded again. the next signature writes a new genesis.";
        }
        FANO_AUTH.burn();
        return "keystore destroyed — the desk will ask for the pledge again." +
          "\n(genesis survives — the founding is a fact. 'burn genesis' erases it.)";
      }
      case "rekey": {
        if (!FANO_AUTH || !FANO_AUTH.session.sk) return "rekey: unlock first — cold keystore cannot sign";
        var rec2 = FANO_AUTH.loadRecord();
        var cert = FANO_AUTH.issueCert(FANO_AUTH.unhex(rec2.pk),
          rec2.user, rec2.cert.role, FANO_AUTH.unhex(rec2.covenant_sha256),
          FANO_AUTH.unhex(rec2.pk), FANO_AUTH.session.sk, 365 * 5);
        if (!cert) return "rekey: signature failed";
        rec2.cert = cert; localStorage.setItem(FANO_AUTH.STORE_KEY, JSON.stringify(rec2));
        return "rekey: certificate re-issued, expiry +5y — same key, new paper.";
      }
      case "grant": {
        if (!FANO_AUTH) return "auth module absent";
        if (!FANO_AUTH.session.sk) return "grant: unlock first — cold keystore cannot sign";
        if (!arg) return "grant: usage — grant <callsign> [subject-pk-hex]";
        var gp = argRaw.split(/\s+/);
        var g = FANO_AUTH.grantCallsign(gp[0], gp[1] || null, 90);
        if (g && g.error === "not_restricted") return "grant: '" + gp[0] + "' is not a reserved callsign — it needs no paper.";
        if (!g) return "grant: refused — issuing reserved callsigns requires STATION-CHIEF clearance.";
        return "grant: '" + g.callsign + "' authorized — signed by fp " + g.iss.slice(0, 8).toUpperCase() +
          "…, expires " + new Date(g.exp * 1000).toISOString().slice(0, 10) +
          "\ntoken: " + FANO_AUTH.exportGrant(g.callsign);
      }
      case "grants": {
        if (!FANO_AUTH) return "auth module absent";
        var all = FANO_AUTH.grants(), names = Object.keys(all);
        if (!names.length) return "no callsign grants on this desk.";
        return names.map(function (n) {
          var g = all[n];
          return "  " + n + " → " + (g.sub ? "fp " + g.sub.slice(0, 8).toUpperCase() + "…" : "unclaimed") +
            " · iss " + g.iss.slice(0, 8).toUpperCase() + "… · exp " + new Date(g.exp * 1000).toISOString().slice(0, 10);
        }).join("\n");
      }
      case "zulu": return new Date().toISOString().replace("T", " ").slice(0, 19) + "Z — the clock never lies here.";
      case "titles": {
        var seen = state.titlesSeen || [];
        return "film roll — " + seen.length + "/" + Object.keys(FILMS).length +
          (seen.length ? "\nseen: " + seen.join(", ") : "\ntype any of the twenty-five titles.");
      }
      case "martini": case "shaken": case "stirred":
        egg("mixologist"); return t("term.martini");
      case "goldeneye":
        seenTitle("goldeneye"); egg("satellite"); setTheme("goldeneye"); return t("term.goldeneye");
      case "skyfall":
        seenTitle("skyfall"); egg("residence"); return t("term.skyfall");
      case "sigma": egg("sigil"); return t("term.sigma");
      case "aiwo": egg("corps"); return t("term.aiwo");
      case "columbus": egg("columbus"); return t("term.columbus");
      case "m": return t("term.mcommittee");
      case "moneypenny": return t("term.pennyflirt");
      case "provider": openGovProvider(); return "governed provider panel opened.";
      case "academy": openAcademy(); return "academy.os opened — source-linked lessons await.";
      case "science": openScience(); return "q-branch inventory opened — honest labels only.";
      case "codex": egg("codex"); openScience(); return t("term.codex", String(state.anoms.length), String(state.anomsTotal || "?"));
      case "gate": {
        if (!GOV_CFG.token) { openGovProvider(); return "configure 'provider' first — the bridge is the gate."; }
        var parts = arg.split(/\s+/);
        var risk = parts[0] || "low";
        var tool = parseInt(parts[1] || "1", 10) || 1;
        var req = parseInt(parts[2] || "0", 10) || 0;
        govFetch("/gate", {
          method: "POST",
          body: JSON.stringify({ actor: FANO_AUTH.session.user || "cadet", target: "ask", context: "fano-1", held_clearance: FANO_AUTH.session.role || 0, required_clearance: req, tool_class: tool, risk: risk, evidence: "verified", covenant_aligned: !!(FANO_AUTH.loadRecord() && FANO_AUTH.loadRecord().covenant_sig), provenance_auditable: true })
        })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j.gate) print("[dry-run " + j.gate.decision + ": " + j.gate.reason + (j.gate.escalation ? " · escalates" : "") + " · audit " + (j.audit ? j.audit.digest.slice(0, 16) + "…" : "none") + "]");
            else print("[bridge error: " + (j.error || "unknown") + "]");
          })
          .catch(function (e) { print("[governed bridge unavailable — " + e + "]"); });
        return "gate: dry-running <risk> <tool_class> <required_clearance> — no model contacted.";
      }
      case "ask": {
        if (!arg) return "ask: ask what?";
        if (!GOV_CFG.token || !GOV_CFG.model) { openGovProvider(); return "configure 'provider' first — the bridge is the gate."; }
        print("fano:~$ ask " + arg + "\n[governed bridge → " + GOV_CFG.provider + " → " + GOV_CFG.model + "]");
        govFetch("/ask", {
          method: "POST",
          body: JSON.stringify({ actor: FANO_AUTH.session.user || "cadet", target: "ask", context: "fano-1", held_clearance: FANO_AUTH.session.role || 0, required_clearance: 0, tool_class: 1, risk: "low", evidence: "verified", covenant_aligned: !!(FANO_AUTH.loadRecord() && FANO_AUTH.loadRecord().covenant_sig), provenance_auditable: true, provider: GOV_CFG.provider, model: GOV_CFG.model, prompt: "You are the SPEC-007 dossier — an integer-only evidence ledger. Answer terse and factual, label uncertainty. Question: " + arg })
        })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j.ok) print("[modeled · audit " + j.audit.digest.slice(0, 16) + "…]\n" + j.response);
            else if (j.gate) print("[governance " + j.gate.decision + ": " + j.gate.reason + " · audit " + (j.audit ? j.audit.digest.slice(0, 16) + "…" : "none") + "]");
            else print("[bridge error: " + (j.error || "unknown") + "]");
          })
          .catch(function (e) { print("[governed bridge unavailable — " + e + "]"); });
        return null;
      }
      case "decode": {
        var da = arg.replace(/\s+/g, "-");
        if (da === "scp-006-fr" || da === "fr" || da === "-fr") return decodeChain(3);
        if (da === "scp-006" || da === "fountain" || da === "astrakhan") return decodeChain(2);
        return decodeChain(1);
      }
      case "xyzzy": return t("term.xyzzy");
      case "look": return t("term.look");
      case "open sesame": egg("sesamist"); deniedMenu(); return t("term.sesame");
      case "sudo": return t("term.sudo");
      case "lang":
        if (!arg) return t("term.lang") + (state.lang === "zh" ? "繁體中文" : "English");
        if (arg === "zh" || arg === "zh-hant" || arg === "中文" || arg === "繁體") { setLang("zh"); egg("interpreter"); return t("term.langset"); }
        if (arg === "en" || arg === "english") { setLang("en"); return t("term.langset.en"); }
        return "lang: " + arg + " — try en or zh";
      case "clear": return "\x00";
      case "lock": window.location.href = "index.html"; return t("term.locking");
      case "": return "";
      default: {
        var cw = CANON_WORDS[full];
        if (cw) {
          if (cw.egg) egg(cw.egg);
          if (cw.chain) return (cw.pre ? t(cw.pre) + "\n" : "") + decodeChain(cw.chain);
          if (cw.burn && FANO_AUTH) { FANO_AUTH.burn(); return t(cw.tkey); }
          if (cw.open) { openDoc(cw.open, cw.open.replace(".html", "")); return t(cw.tkey); }
          return t(cw.tkey);
        }
        var zt = FILMS_ZH[cmd.trim()];
        if (zt) return seenTitle(zt);
        if (FILMS[full]) return seenTitle(full);
        var wc = FANO_AUTH && FANO_AUTH.checkCallsign && FANO_AUTH.checkCallsign(full);
        if (wc && wc.ok === false && wc.restricted) { egg("namesake"); return t("term.watchlist"); }
        return c + ": " + t("term.notfound");
      }
    }
  }

  function openTerm() {
    var title = "fano:~$ — terminal";
    if (openWins[title]) { focus(openWins[title]); return; }
    var box = document.createElement("div");
    box.className = "win-body console";
    box.style.fontFamily = "inherit";
    var log = document.createElement("pre");
    log.style.margin = "0";
    log.style.whiteSpace = "pre-wrap";
    log.textContent = t("term.banner") + "\n";
    var inp = document.createElement("input");
    inp.className = "term-in";
    inp.spellcheck = false;
    inp.placeholder = "fano:~$";
    box.appendChild(log);
    box.appendChild(inp);
    var win = makeWindow(title, box);
    win.style.width = "34rem";
    win.style.height = "26rem";
    function print(s) { log.textContent += s + "\n"; log.parentElement.scrollTop = 1e9; }

    /* history + completion: the shell remembers what the desk forgets (24+25) */
    var histIdx = -1, draft = "";
    var WORDS = TERM_CMDS.concat(ALL_DOCS,
      Object.keys(FS).map(function (k) { return k.toLowerCase(); }),
      ["covenant", "about", "7q.drawer", "self_destruct.txt"]);
    function complete() {
      var v = inp.value;
      var tail = v.split(/\s+/).pop();
      if (!tail) return;
      var hits = WORDS.filter(function (w) { return w.toLowerCase().indexOf(tail.toLowerCase()) === 0; });
      if (!hits.length) return;
      if (hits.length === 1) {
        inp.value = v.slice(0, v.length - tail.length) + hits[0] + (v.indexOf(" ") < 0 ? " " : "");
      } else {
        var pre = hits[0], i = tail.length;
        while (hits.every(function (h) { return h.slice(0, i + 1).toLowerCase() === pre.slice(0, i + 1).toLowerCase(); })) i++;
        inp.value = v.slice(0, v.length - tail.length) + hits[0].slice(0, i);
        print("fano:~$ " + v + "\n" + hits.join("   "));
      }
    }
    inp.addEventListener("keydown", function (e) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (histIdx < 0) draft = inp.value;
        if (state.termHist.length) { histIdx = Math.min(histIdx + 1, state.termHist.length - 1); inp.value = state.termHist[state.termHist.length - 1 - histIdx] || ""; }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (histIdx >= 0) { histIdx--; inp.value = histIdx < 0 ? draft : state.termHist[state.termHist.length - 1 - histIdx]; }
        return;
      }
      if (e.key === "Tab") { e.preventDefault(); complete(); return; }
      if (e.key !== "Enter") return;
      var cmd = inp.value;
      inp.value = "";
      histIdx = -1;
      if (cmd.trim()) {
        state.termHist.push(cmd);
        if (state.termHist.length > 50) state.termHist.shift();
        if (state.termHist.length >= 50) achieve("historian");
        var verb = cmd.trim().split(/\s+/)[0].toLowerCase();
        if (state.termCmds.indexOf(verb) < 0) { state.termCmds.push(verb); if (state.termCmds.length >= 10) egg("poweruser"); }
        save();
      }
      print("fano:~$ " + cmd);
      var out = termExec(cmd, print);
      if (out === "\x00") log.textContent = "";
      else if (out) print(out);
    });
    box.addEventListener("click", function () { inp.focus(); });
    setTimeout(function () { inp.focus(); }, 50);
    firstOpen("term", 10, "a shell of one's own");
  }

  /* ---------- desktop icons ---------- */

  var ICONS = [
    { kind: "folder", key: "L0_PUBLIC", glyph: "▤", label: "L0_PUBLIC", sub: "release" },
    { kind: "folder", key: "L1_TRUSTED", glyph: "▤", label: "L1_TRUSTED", sub: "numbers" },
    { kind: "folder", key: "L2_FILE", glyph: "▤", label: "L2_FILE", sub: "the file" },
    { kind: "folder", key: "L3_OPS", glyph: "▤", label: "L3_OPS", sub: "q branch" },
    { kind: "folder", key: "Q_BRANCH", glyph: "▤", label: "Q_BRANCH", sub: "fractions" },
    { kind: "folder", key: "LEAK_SPILL", glyph: "▒", label: "LEAK_SPILL", sub: "leaked" },
    { kind: "file", glyph: "≡", label: "covenant.txt", sub: "the pledge", act: function () { openConsole("covenant.txt", COVENANT); achieve("sworn"); } },
    { kind: "file", glyph: "◉", label: "qstar.pet", sub: "421 nodes", act: openPet },
    { kind: "file", glyph: "▸_", label: "terminal", sub: "fano:~$", act: openTerm },
    { kind: "file", glyph: "≡", label: "about_fano1.txt", sub: "sysinfo", act: openAbout },
    { kind: "file", glyph: "≡", label: "field_manual.txt", sub: "service record", act: openManual },
    { kind: "app", glyph: "◈", label: "quplink", sub: "sandbox", act: function () { if (window.QUPLINK) window.QUPLINK.open(); } },
    { kind: "app", glyph: "◍", label: "rations.os", sub: "air-gap web", act: function () { openDoc("apps/rations/quine.html", "rations.os"); achieve("resupply"); } },
    { kind: "app", glyph: "☏", label: "comms.os", sub: "tradecraft desk", act: function () { if (window.FANO_COMMS) { window.FANO_COMMS.open(); achieve("operator"); } } },
    { kind: "file", glyph: "≡", label: "self_destruct.txt", sub: "read once", act: openSelfDestruct },
    { kind: "locked", glyph: "✦", label: "admiralty.suite", sub: "flag tier", act: openAdmiralty },
    { kind: "locked", glyph: "▦", label: "7q.drawer", sub: "SEALED", act: deniedIcon },
  ];

  var ICON_TIPS = {
    L0_PUBLIC: "5 files · public release",
    L1_TRUSTED: "what the arithmetic proves",
    L2_FILE: "the file on the asset — C01–C52",
    L3_OPS: "q branch operations",
    Q_BRANCH: "where the floor dropped something",
    LEAK_SPILL: "what 7q could not hold — the adversary's doctrine",
    "covenant.txt": "the signature is already on file",
    "qstar.pet": "421 nodes — it dreams in i128",
    terminal: "canon as commands · ↑/↓ history · Tab completes",
    "about_fano1.txt": "sysinfo, canon edition",
    "field_manual.txt": "your service record",
    quplink: "games · sandbox · render deck",
    "rations.os": "the air-gapped web platform — sister system, same quartermaster",
    "comms.os": "wire · messenger · dead drops · stego · shamir · carriers — the tradecraft drawer",
    "self_destruct.txt": "do not read twice",
    "admiralty.suite": "the board of admiralty — naval command · star command",
    "7q.drawer": "SPEC-004 · compartment 7q · sealed",
  };
  var iconWrap = document.getElementById("icons");
  var iconRefs = {};
  ICONS.forEach(function (ic) {
    var el = document.createElement("div");
    el.className = "icon " + ic.kind;
    el.dataset.key = ic.label; /* canonical id — display text may localize */
    el.dataset.tip = t("tip." + ic.label) !== "tip." + ic.label ? t("tip." + ic.label) : (ic.sub || "");
    el.innerHTML =
      '<span class="glyph">' + ic.glyph + "</span>" +
      '<span class="label">' + t("ic." + ic.label) + "</span>" +
      '<span class="sub">' + t("sub." + (ic.sub || "")) + "</span>";
    iconRefs[ic.label] = el;
    function fire() {
      if (ic.kind === "folder") openFolder(ic.key);
      else ic.act();
    }
    el.addEventListener("dblclick", fire);
    el.addEventListener("click", function () {
      document.querySelectorAll(".icon").forEach(function (i) { i.classList.remove("selected"); });
      el.classList.add("selected");
    });
    /* drag to rearrange: hold, move, drop */
    el.addEventListener("pointerdown", function (e) {
      var moved = false;
      var sx = e.clientX, sy = e.clientY;
      function move(ev) {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        if (!moved) {
          moved = true;
          el.style.position = "fixed";
          el.style.zIndex = 5000;
          el.style.pointerEvents = "none";
          document.body.appendChild(el);
        }
        el.style.left = ev.clientX - 40 + "px";
        el.style.top = ev.clientY - 30 + "px";
      }
      function up() {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        if (moved) {
          el.style.pointerEvents = "";
          el.style.zIndex = "";
          /* free-positioned icons keep absolute coords */
          el.dataset.free = "1";
          state.icons[ic.label] = { left: el.style.left, top: el.style.top };
          achieve("decorator");
          var r = el.getBoundingClientRect();
          if (r.left > window.innerWidth - 160 && r.top > window.innerHeight - 160) egg("fengshui");
          save();
        }
      }
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });
    el.addEventListener("keydown", function (e) { if (e.key === "Enter") fire(); });
    el.tabIndex = 0;
    /* restore saved free position */
    if (state.icons[ic.label]) {
      el.style.position = "fixed";
      el.style.left = state.icons[ic.label].left;
      el.style.top = state.icons[ic.label].top;
      el.dataset.free = "1";
      document.body.appendChild(el);
    } else {
      iconWrap.appendChild(el);
    }
  });
  paintBadges();

  /* ---------- start menu ---------- */

  var startBtn = document.getElementById("ostf-btn");
  var startMenu = document.getElementById("start-menu");
  startBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    startMenu.classList.toggle("open");
  });
  document.addEventListener("click", function () { startMenu.classList.remove("open"); });

  document.getElementById("sm-about").addEventListener("click", function () {
    startMenu.classList.remove("open"); openAbout();
  });
  document.getElementById("sm-drawer").addEventListener("click", function () {
    startMenu.classList.remove("open"); deniedMenu();
  });
  document.getElementById("sm-index").addEventListener("click", function () {
    startMenu.classList.remove("open"); openDoc("cover.html", "Dossier Index");
  });
  document.getElementById("sm-lock").addEventListener("click", function () {
    window.location.href = "index.html";
  });
  /* sound toggle, filed with the rest of the furniture (iter 39) */
  (function () {
    var sm = document.getElementById("start-menu");
    if (!sm) return;
    var d = document.createElement("div");
    d.className = "sm-item";
    function paint() { d.innerHTML = "<span>Sound</span><span class='hint'>" + (state.muted ? "muted" : "live") + "</span>"; }
    d.addEventListener("click", function (e) {
      e.stopPropagation();
      state.muted = !state.muted; save(); paint();
      if (!state.muted) sfx.chime();
    });
    var run = document.getElementById("sm-run");
    sm.insertBefore(d, run);
    paint();
  })();
  /* screensaver on demand — the start menu can put the desk to sleep */
  (function () {
    var sm = document.getElementById("start-menu");
    if (!sm) return;
    var d = document.createElement("div");
    d.className = "sm-item";
    d.innerHTML = "<span>Screensaver</span><span class='hint'>the ledger drifts</span>";
    d.addEventListener("click", function () { sm.classList.remove("open"); saverStart(); });
    var run = document.getElementById("sm-run");
    sm.insertBefore(d, run);
  })();
  /* shell controls — only on the Admiralty's own machine (Electron) */
  (function () {
    var D = window.ADMIRALTY_DESK, sm = document.getElementById("start-menu");
    if (!D || !D.isDesk || !sm) return;
    var run = document.getElementById("sm-run");
    [["Minimize shell", "ctrl+m", D.minimize],
     ["Full-screen", "f11", D.toggleFullscreen],
     ["Exit workstation", "ctrl+shift+q", D.quit]].forEach(function (it) {
      var d = document.createElement("div");
      d.className = "sm-item";
      d.innerHTML = "<span>" + it[0] + "</span><span class='hint'>" + it[1] + "</span>";
      d.addEventListener("click", function () { sm.classList.remove("open"); it[2](); });
      sm.insertBefore(d, run);
    });
  })();

  /* run box → live-search launcher: results appear as you type (iter 31) */
  var smRun = document.getElementById("sm-run");
  var TITLES = { "public.html": "The Briefing", "covert-en.html": "Covert EN",
    "covert-zh.html": "Covert ZH", "terminology.html": "Terminology",
    "cover.html": "Dossier Index", "verified.html": "Trusted Numbers",
    "dossier.html": "The File", "claims.html": "Interrogation",
    "input-audit.html": "Input Audit", "expanded.html": "Expanded Design",
    "economics.html": "The Ledger", "red-team.html": "Red Team",
    "governance.html": "Governance", "ledger.html": "Fractions", "charter.html": "Charter" };
  var smHits = document.createElement("div");
  smHits.className = "sm-hits";
  smRun.parentElement.insertBefore(smHits, smRun.nextSibling);
  function runQuery(q) {
    q = q.toLowerCase();
    var out = [];
    if ("terminal".indexOf(q) >= 0) out.push({ n: "terminal — fano:~$", act: openTerm });
    if ("pet".indexOf(q) >= 0 || "qstar".indexOf(q) >= 0) out.push({ n: "qstar.pet — 421 nodes", act: openPet });
    if ("quplink".indexOf(q) >= 0 || "uplink".indexOf(q) >= 0) out.push({ n: "quplink — sandbox", act: function () { if (window.QUPLINK) window.QUPLINK.open(); } });
    if ("rations".indexOf(q) >= 0 || "rations.os".indexOf(q) >= 0) out.push({ n: "rations.os — air-gap web", act: function () { openDoc("apps/rations/quine.html", "rations.os"); } });
    if ("comms".indexOf(q) >= 0 || "comms.os".indexOf(q) >= 0) out.push({ n: "comms.os — tradecraft desk", act: function () { if (window.FANO_COMMS) window.FANO_COMMS.open(); } });
    if ("sysmon".indexOf(q) >= 0) out.push({ n: "sysmon — the instruments", act: openSysmon });
    if ("manual".indexOf(q) >= 0 || "field".indexOf(q) >= 0) out.push({ n: "field manual", act: openManual });
    Object.keys(TITLES).forEach(function (p) {
      if (p.indexOf(q) >= 0 || TITLES[p].toLowerCase().indexOf(q) >= 0)
        out.push({ n: TITLES[p] + " — " + p, act: function () { openDoc(p, TITLES[p]); } });
    });
    return out;
  }
  smRun.addEventListener("input", function () {
    smHits.innerHTML = "";
    var q = smRun.value.trim();
    if (!q) return;
    runQuery(q).slice(0, 5).forEach(function (h) {
      var d = document.createElement("div");
      d.className = "sm-item";
      d.innerHTML = "<span>" + h.n + "</span><span class='hint'>↵</span>";
      d.addEventListener("click", function (e) {
        e.stopPropagation(); startMenu.classList.remove("open"); smRun.value = ""; smHits.innerHTML = ""; h.act();
      });
      smHits.appendChild(d);
    });
  });
  smRun.addEventListener("keydown", function (e) {
    e.stopPropagation();
    if (e.key !== "Enter") return;
    var q = smRun.value.trim().toLowerCase();
    if (!q) return;
    var hits = runQuery(q);
    startMenu.classList.remove("open");
    smRun.value = ""; smHits.innerHTML = "";
    if (hits.length) hits[0].act();
    else toast("run: nothing filed under '" + q + "'");
  });
  smRun.addEventListener("click", function (e) { e.stopPropagation(); });

  /* ---------- clock ---------- */

  /* wallpaper + furniture eggs */
  var wallSvg = document.querySelector(".wall svg");
  if (wallSvg) { wallSvg.style.pointerEvents = "auto"; wallSvg.style.cursor = "crosshair";
    wallSvg.addEventListener("click", function () { egg("geom"); }); }
  var cap = document.querySelector(".wall-caption");
  if (cap) { cap.style.pointerEvents = "auto"; cap.style.cursor = "help";
    cap.addEventListener("click", function () { egg("fineprint"); }); }
  var ostfClicks = [];
  startBtn.addEventListener("click", function () {
    var now = Date.now();
    ostfClicks = ostfClicks.filter(function (t) { return now - t < 3000; });
    ostfClicks.push(now);
    if (ostfClicks.length >= 7) { ostfClicks = []; egg("impatient"); }
  });

  var clock = document.getElementById("clock");
  clock.style.cursor = "help";
  clock.addEventListener("click", function () { egg("zulu"); });
  function tick() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, "0"); };
    clock.innerHTML =
      p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds()) +
      " <b>ZULU</b>";
  }
  /* ---------- webaudio bleeps: the desk talks (iter 17) ---------- */

  var AC = null;
  function bleep(freq, dur, type, when) {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = type || "square";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.04, AC.currentTime + (when || 0));
      g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + (when || 0) + dur);
      o.connect(g).connect(AC.destination);
      o.start(AC.currentTime + (when || 0));
      o.stop(AC.currentTime + (when || 0) + dur);
    } catch (e) { /* no audio device — the desk stays quiet */ }
  }
  var sfx = {
    open: function () { bleep(880, 0.05); },
    close: function () { bleep(440, 0.05); },
    min: function () { bleep(520, 0.04); bleep(390, 0.05, "square", 0.05); },
    snap: function () { bleep(300, 0.04); bleep(700, 0.06, "triangle", 0.04); },
    denied: function () { bleep(140, 0.25, "sawtooth"); },
    toast: function () { bleep(660, 0.04); },
    palette: function () { bleep(1040, 0.03, "sine"); bleep(1560, 0.04, "sine", 0.04); },
    boot: function () { bleep(392, 0.06); bleep(523, 0.06, "sine", 0.07); bleep(784, 0.1, "sine", 0.14); },
    chime: function () { bleep(660, 0.07); bleep(880, 0.09, "square", 0.08); },
    egg: function () { bleep(523, 0.05); bleep(659, 0.05, "square", 0.06); bleep(784, 0.08, "square", 0.12); },
  };
  function sfxGuard(fn) { return function () { if (!state.muted) fn(); }; }
  Object.keys(sfx).forEach(function (k) { sfx[k] = sfxGuard(sfx[k]); });

  /* ---------- context menus (iter 15) ---------- */

  var ctx = document.getElementById("ctxmenu");
  function hideCtx() { if (ctx) ctx.classList.remove("open"); }
  function showCtx(x, y, items) {
    if (!ctx) return;
    ctx.innerHTML = "";
    items.forEach(function (it) {
      var d = document.createElement("div");
      d.className = "ctx-item" + (it.sep ? " ctx-sep" : "");
      d.textContent = it.label;
      if (it.act) d.addEventListener("click", function () { hideCtx(); it.act(); });
      ctx.appendChild(d);
    });
    ctx.style.left = Math.min(x, window.innerWidth - 200) + "px";
    ctx.style.top = Math.min(y, window.innerHeight - items.length * 28 - 10) + "px";
    ctx.classList.add("open");
  }
  document.addEventListener("click", hideCtx);
  document.addEventListener("contextmenu", function (e) {
    var ic = e.target.closest && e.target.closest(".icon");
    if (ic) {
      e.preventDefault();
      var label = ic.dataset.key || ic.querySelector(".label").textContent;
      var def = ICONS.find(function (i) { return i.label === label; });
      showCtx(e.clientX, e.clientY, [
        { label: t("ctx.open"), act: function () { ic.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); } },
        { label: t("ctx.props"), act: function () {
          openConsole("properties — " + label,
            "file:      " + label + "\ntype:      " + (def ? def.kind : "?") +
            "\nstatus:    " + (ic.dataset.free === "1" ? "relocated by agent" : "registry position") +
            "\nauthority: " + (def && def.kind === "locked" ? "SPEC-004 · 7q" : "public release") +
            "\nnote:      " + (def && def.sub || "—"));
        } },
        { sep: true, label: "—" },
        { label: t("ctx.rename"), act: function () { toast(t("toast.norename")); } },
      ]);
      return;
    }
    if (e.target.closest && (e.target.closest(".win") || e.target.closest(".taskbar") || e.target.closest("#toasts") || e.target.closest("#boot") || e.target.closest(".start-menu"))) return;
    if (e.target.closest && e.target.closest("body")) {
      e.preventDefault();
      var items = [
        { label: "Arrange icons", act: function () {
          state.icons = {}; save();
          document.querySelectorAll(".icon").forEach(function (i) {
            i.style.position = ""; i.style.left = ""; i.style.top = ""; i.dataset.free = "";
            iconWrap.appendChild(i);
          });
          toast(t("toast.iconsback"));
        } },
        { label: t("ctx.newterm"), act: openTerm },
      ];
      items.push({ sep: true, label: t("ctx.livery") });
      Object.keys(THEMES).forEach(function (tk) {
        items.push({ label: (state.theme === tk ? "● " : "○ ") + THEMES[tk].label +
          (tk === "crt" ? " · konami issue" : ""),
          act: function () { setTheme(tk); toast(t("toast.livery") + THEMES[tk].label); achieve("wardrobe"); } });
      });
      items.push({ sep: true, label: "—" });
      items.push({ label: t("ctx.manual"), act: openManual });
      showCtx(e.clientX, e.clientY, items);
    }
  });

  /* ---------- theme engine: four station liveries (iter 21) ---------- */

  var THEMES = {
    station:   { label: "STATION",   cls: "",   desc: "ops-cyan on graphite" },
    crt:       { label: "PHOSPHOR",  cls: "crt", desc: "green channel Q — konami issue" },
    whitehall: { label: "WHITEHALL", cls: "wh",  desc: "icy daylight — papers out" },
    spectre:   { label: "SPECTRE",   cls: "sp",  desc: "crimson after hours" },
    goldeneye: { label: "GOLDENEYE", cls: "ge", desc: "orbital gold — not in the catalogue", hidden: true },
  };
  if (state.theme === "amber") state.theme = "station"; /* pre-engine migration */
  var THEME_CLASSES = Object.keys(THEMES).map(function (k) { return THEMES[k].cls; }).filter(Boolean);
  function setTheme(t) {
    if (!THEMES[t]) return;
    state.theme = t;
    THEME_CLASSES.forEach(function (c) { document.body.classList.remove(c); });
    if (THEMES[t].cls) document.body.classList.add(THEMES[t].cls);
    save();
  }
  var SEQ = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
  var seqPos = 0;
  document.addEventListener("keydown", function (e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    seqPos = (k === SEQ[seqPos]) ? seqPos + 1 : (k === SEQ[0] ? 1 : 0);
    if (seqPos === SEQ.length) {
      seqPos = 0;
      egg("konami");
      setTheme(state.theme === "crt" ? "station" : "crt");
      toast(state.theme === "crt" ? "PHOSPHOR MODE — channel Q" : "STATION MODE — back to the desk");
    }
  });
  THEME_CLASSES.forEach(function (c) { document.body.classList.remove(c); });
  if (THEMES[state.theme] && THEMES[state.theme].cls) document.body.classList.add(THEMES[state.theme].cls);

  /* ---------- keyboard shortcuts (iter 16) ---------- */

  var iconEls = function () { return [].slice.call(document.querySelectorAll(".icon")); };
  document.addEventListener("keydown", function (e) {
    if (!bootDone) return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    var sel = document.querySelector(".icon.selected");
    switch (e.key) {
      case "Escape":
        if (startMenu.classList.contains("open")) { startMenu.classList.remove("open"); break; }
        var top = [].slice.call(document.querySelectorAll(".win"))
          .sort(function (a, b) { return (+b.style.zIndex || 0) - (+a.style.zIndex || 0); })[0];
        if (top) { top.querySelector(".win-close").click(); }
        break;
      case "Enter":
        if (sel) sel.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        break;
      case "Delete": case "Backspace":
        if (sel) {
          var l = sel.querySelector(".label").textContent;
          toast(l === "self_destruct.txt"
            ? "nice try — it destroys itself, not the other way round"
            : "canon files cannot be deleted. the archive policy is literal.");
        }
        break;
      case "ArrowLeft": case "ArrowRight": case "ArrowUp": case "ArrowDown": {
        /* Ctrl+Alt+arrows — snap the focused window (iter 40) */
        if (e.ctrlKey && e.altKey) {
          var fw = document.querySelector(".win.focused");
          if (!fw) break;
          e.preventDefault();
          var horiz = (e.key === "ArrowLeft" || e.key === "ArrowRight");
          var up = e.key === "ArrowUp", dn = e.key === "ArrowDown";
          if (fw.classList.contains("snapped") && fw.dataset.snapSide) {
            /* already half-snapped: second arrow refines to a quarter */
            var side = fw.dataset.snapSide;
            if (up) snapTo(fw, side === "l" ? "tl" : "tr");
            else if (dn) snapTo(fw, side === "l" ? "bl" : "br");
            else if ((e.key === "ArrowLeft" && side === "l") || (e.key === "ArrowRight" && side === "r")) snapTo(fw, "max");
            else fw.classList.remove("snapped"), delete fw.dataset.snapSide;
          } else if (horiz) {
            snapTo(fw, e.key === "ArrowLeft" ? "l" : "r");
            fw.dataset.snapSide = e.key === "ArrowLeft" ? "l" : "r";
          } else if (up) snapTo(fw, "max");
          else { fw.classList.remove("snapped"); delete fw.dataset.snapSide; sfx.min(); }
          break;
        }
        if (e.target === document.body || !e.target.closest || !e.target.closest(".win")) {
          var els = iconEls();
          var idx = els.indexOf(sel);
          var dir = (e.key === "ArrowRight" || e.key === "ArrowDown") ? 1 : -1;
          var next = els[(idx + dir + els.length) % els.length];
          if (next) { next.click(); e.preventDefault(); }
        }
        break;
      }
      case "l":
        if (e.ctrlKey) { e.preventDefault(); window.location.href = "index.html"; }
        break;
      case "w":
        if (e.ctrlKey && e.altKey) {
          e.preventDefault();
          var fw = document.querySelector(".win.focused");
          if (fw) fw.querySelector(".win-close").click();
        }
        break;
    }
  });

  /* ---------- alt-tab cycler: the desk remembers z-order (iter 23) ---------- */

  var cycEl = null, cycIdx = 0, cycList = [];
  function cycShow() {
    if (!cycEl) {
      cycEl = document.createElement("div");
      cycEl.id = "cycler";
      document.body.appendChild(cycEl);
    }
    cycList = [].slice.call(document.querySelectorAll(".win"))
      .sort(function (a, b) { return (+b.style.zIndex || 0) - (+a.style.zIndex || 0); });
    cycEl.innerHTML = "";
    cycList.forEach(function (w, i) {
      var d = document.createElement("div");
      d.className = "cyc-item" + (i === cycIdx % cycList.length ? " on" : "");
      d.textContent = w.querySelector(".win-title").textContent +
        (w.style.display === "none" ? "  (shelved)" : "");
      cycEl.appendChild(d);
    });
    cycEl.classList.add("on");
  }
  function cycCommit() {
    if (!cycEl) return;
    cycEl.classList.remove("on");
    var w = cycList[cycIdx % cycList.length];
    cycEl = null; cycIdx = 0;
    if (!w) return;
    if (w.style.display === "none") {
      w.style.display = "";
      var t = document.querySelector('.task-item[data-wid="' + w.dataset.wid + '"]');
      if (t) t.classList.remove("minimized");
    }
    focus(w);
  }
  document.addEventListener("keydown", function (e) {
    if (!bootDone || !e.altKey) return;
    if (e.key === "Tab") {
      e.preventDefault();
      if (!cycEl) cycIdx = 0; else cycIdx++;
      cycShow();
      sfx.min();
    }
  });
  document.addEventListener("keyup", function (e) {
    if (e.key === "Alt" && cycEl) cycCommit();
  });

  /* ---------- screensaver: idle becomes spectacle (iter 19) ---------- */

  var FRACTIONS = ["0.07 kWh", "1/8 aperture", "421/3375", "155 Wh", "26.667:1",
    "half an ulp", "0.68 $/kWh", "332 cm³", "12 mL headspace", "92 tests",
    "bcb81b78…", "three buses", "two paths", "one drawer", "zero authority"];
  var saver = document.getElementById("saver");
  var saverFano = document.getElementById("saver-fano");
  var saverTape = document.getElementById("saver-tape");
  var idleTimer = null, saverOn = false, saverAnim = null, saverStartT = 0;

  saverFano.innerHTML = document.querySelector(".wall svg").outerHTML;

  function saverFrame() {
    if (!saverOn) return;
    saverFano.style.transform =
      "translate(" + (10 + Math.random() * 70) + "vw," + (10 + Math.random() * 60) + "vh)" +
      " rotate(" + (Math.random() * 360) + "deg)";
    saverAnim = setTimeout(saverFrame, 3000);
  }
  var tapeIdx = 0, tapeTimer = null;
  function tapeFrame() {
    if (!saverOn) return;
    saverTape.style.opacity = "0";
    setTimeout(function () {
      if (!saverOn) return;
      saverTape.textContent = "— " + FRACTIONS[tapeIdx++ % FRACTIONS.length] + " —";
      saverTape.style.opacity = "0.8";
      tapeTimer = setTimeout(tapeFrame, 2600);
    }, 400);
  }
  function saverStart() {
    if (saverOn || !bootDone) return;
    saverOn = true;
    saverStartT = Date.now();
    saver.classList.add("on");
    saverTape.style.transition = "opacity .4s";
    saverFrame();
    tapeFrame();
  }
  function saverStop() {
    if (!saverOn) return;
    saverOn = false;
    saver.classList.remove("on");
    clearTimeout(saverAnim); clearTimeout(tapeTimer);
  }
  function poke() {
    lastActive = Date.now();
    if (saverOn && Date.now() - saverStartT > 30000) egg("waker");
    saverStop();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(saverStart, 90000);
  }
  ["pointermove", "pointerdown", "keydown", "wheel"].forEach(function (ev) {
    document.addEventListener(ev, poke, { passive: true });
  });
  poke();

  /* ---------- field manual: the career record (iter 20) ---------- */

  var sessionStart = Date.now();
  state.totalSec = state.totalSec || 0;
  setInterval(function () {
    state.totalSec += 10; save();
  }, 10000);

  function fmtTime(s) {
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? h + "h " + m + "m" : m + "m " + (s % 60) + "s";
  }

  function manualText() {
    var lines = [
      "FIELD MANUAL — service record",
      "════════════════════════════════",
      "clearance      L" + clearance() + " · " + state.xp + "xp" +
        "  (next: " + (XP_LEVELS[clearance() + 1] || "—") + "xp)",
      "time on desk   " + fmtTime(state.totalSec),
      "",
      "achievements   " + state.achievements.length + "/" + Object.keys(ACHIEVEMENTS).length,
    ];
    Object.keys(ACHIEVEMENTS).forEach(function (k) {
      var got = state.achievements.indexOf(k) >= 0;
      lines.push("  " + (got ? "■" : "□") + " " + ACHIEVEMENTS[k]);
    });
    lines.push("");
    lines.push("eggs           " + state.eggs.length + "/" + Object.keys(EGGS).length);
    Object.keys(EGGS).forEach(function (k) {
      var got = state.eggs.indexOf(k) >= 0;
      lines.push("  " + (got ? "■" : "□") + " " + (got ? EGGS[k] : "???"));
    });
    lines.push("");
    lines.push("dossier        " + Object.keys(DOCS_READ).length + "/15 pages read");
    Object.keys(FS).forEach(function (k) {
      var n = FS[k].items.filter(function (i) { return DOCS_READ[i[0]]; }).length;
      lines.push("  " + k + " ".repeat(Math.max(1, 12 - k.length)) + " " +
        n + "/" + FS[k].items.length + (n === FS[k].items.length ? " ✓" : ""));
    });
    lines.push("render deck    " + state.vizSeen.length + "/8 panes screened");
    lines.push("terminal       " + state.termHist.length + " commands on record · " +
      state.termCmds.length + " distinct");
    lines.push("livery         " + THEMES[state.theme].label +
      (state.eggs.indexOf("konami") >= 0 ? "" : " (one more exists)"));
    lines.push("audio          " + (state.muted ? "muted" : "live"));
    lines.push("");
    lines.push("save code      terminal: 'export' — career travels with you");
    return lines.join("\n");
  }

  function openManual() { openConsole("field_manual.txt", manualText()); firstOpen("manual", 5, "know thyself"); }

  /* ---------- POST boot (iter 11) ---------- */

  var BOOT_LINES = [
    "FANO-1 BIOS v7 — Q128.128 integer core",
    "ALU check: u128 ………………… OK",
    "shadow layer: i256/i512 …… OK (half-ulp)",
    "lattice: 421 e0 nodes ……… RESIDENT",
    "wasm core: spec007.wasm …… @@WASM@@",
    "harness: 92 tests …………… GREEN",
    "baseline: bcb81b78ebeab9… UNCHANGED",
    "drawer seal …………………… ENGAGED",
    "clearance restore: L" + clearance() + " · " + state.xp + "xp … OK",
    "signing authority: Fleet Admiral — verified",
    "",
    "desktop ready. mind the drawer.",
  ];
  var bootEl = document.getElementById("boot");
  var bootLog = document.getElementById("boot-log");
  var bootDone = false;
  function finishBoot() {
    if (bootDone) return;
    bootDone = true;
    bootEl.classList.add("done");
    document.body.classList.add("booted");
    document.removeEventListener("keydown", skipBoot);
    document.removeEventListener("pointerdown", skipBoot);
    sfx.boot();
  }
  function skipBoot() { finishBoot(); }
  (function boot() {
    /* POST runs a real check now: the wasm module answers for itself (iter 38) */
    var wasmLine = "probing …";
    fetch("assets/spec007.wasm").then(function (r) { return r.arrayBuffer(); })
      .then(function (b) { return WebAssembly.instantiate(b); })
      .then(function (o) {
        wasmLine = o.instance.exports.fano_alive() === 421 ? "LIVE · 421" : "ALIVE?";
      })
      .catch(function () { wasmLine = "ABSENT"; });
    var hair = document.createElement("div");
    hair.id = "boot-hair";
    bootEl.appendChild(hair);
    var i = 0;
    function line() {
      if (bootDone) return;
      if (i >= BOOT_LINES.length) { finishBoot(); return; }
      var l = BOOT_LINES[i++];
      l = l.replace("@@WASM@@", wasmLine);
      hair.style.width = Math.floor(i / BOOT_LINES.length * 100) + "%";
      var ok = l.indexOf("OK") >= 0 || l.indexOf("GREEN") >= 0 || l.indexOf("ENGAGED") >= 0 || l.indexOf("UNCHANGED") >= 0 || l.indexOf("RESIDENT") >= 0;
      bootLog.innerHTML += (ok ? '<span class="ok">' : "<span>") +
        l.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</span>\n";
      setTimeout(line, l === "" ? 400 : 210);
    }
    document.addEventListener("keydown", skipBoot);
    document.addEventListener("pointerdown", skipBoot);
    setTimeout(line, 250);
  })();

  /* ---------- public API for the Quplink & future apps ---------- */

  /* canvases read the live palette — CRT mode recolors everything for free */
  function col(name, fallback) {
    var v = getComputedStyle(document.body).getPropertyValue(name).trim();
    return v || fallback;
  }

  /* ---------- i18n: the desk speaks two languages (EN ⇄ 繁體中文) ---------- */

  function t(k, a1, a2) {
    var dict = window.FANO_I18N || {}; /* read live — icons build before this line runs */
    var s = (dict[state.lang] && dict[state.lang][k]) || (dict.en && dict.en[k]) || k;
    if (a1 !== undefined) s = s.replace("%s", a1);
    if (a2 !== undefined) s = s.replace("%s", a2);
    return s;
  }
  function applyLang() {
    document.querySelectorAll(".icon").forEach(function (el) {
      var key = el.dataset.key;
      if (!key) return;
      el.querySelector(".label").textContent = t("ic." + key);
      if (iconRefs[key] && !iconRefs[key].classList.contains("folder"))
        iconRefs[key].querySelector(".sub").textContent =
          t("sub." + (ICONS.find(function (i) { return i.label === key; }).sub || ""));
      el.dataset.tip = t("tip." + key);
    });
    paintBadges();
    var sm = { "sm-about": "sm.about", "sm-index": "sm.index", "sm-drawer": "sm.drawer", "sm-lock": "sm.lock" };
    Object.keys(sm).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var hint = el.querySelector(".hint");
      el.childNodes[0].textContent = t(sm[id]) + " ";
      if (hint) hint.textContent = id === "sm-drawer" ? "" : hint.textContent;
    });
    var head = document.querySelector("#start-menu .sm-head");
    if (head) head.textContent = t("sm.head");
    if (ledW) { ledW.lastChild.textContent = t("led.wasm"); ledW.dataset.tip = t("led.tip.wasm"); }
    if (ledL) { ledL.lastChild.textContent = t("led.lattice"); ledL.dataset.tip = t("led.tip.lattice"); }
    var lb = document.getElementById("lang-btn");
    if (lb) lb.textContent = state.lang === "zh" ? "中" : "EN";
  }
  function setLang(l) {
    if (l !== "zh" && l !== "en") return;
    state.lang = l;
    try { localStorage.setItem("fano1.lang", l); } catch (e) {}
    save(); applyLang();
  }

  /* ---------- sysmon: instruments that agree to be watched (iter 27) ---------- */

  var wasmAlive = null, llmAlive = null;
  function probeWasm() {
    fetch("assets/spec007.wasm").then(function (r) { return r.arrayBuffer(); })
      .then(function (b) { return WebAssembly.instantiate(b); })
      .then(function (o) { wasmAlive = o.instance.exports.fano_alive() === 421; paintLeds(); })
      .catch(function () { wasmAlive = false; paintLeds(); });
  }
  function probeLlm() {
    var to = new AbortController();
    var t = setTimeout(function () { to.abort(); }, 1200);
    fetch("http://localhost:11434/api/tags", { signal: to.signal })
      .then(function () { llmAlive = true; paintLeds(); })
      .catch(function () { llmAlive = false; paintLeds(); })
      .finally(function () { clearTimeout(t); });
  }
  var ledW, ledL;
  function paintLeds() {
    if (ledW) ledW.className = "led" + (wasmAlive === true ? " on" : wasmAlive === false ? " bad" : "");
    if (ledL) ledL.className = "led" + (llmAlive === true ? " on" : llmAlive === false ? " bad" : "");
  }
  (function mountLeds() {
    var bar = document.querySelector(".taskbar");
    if (!bar) return;
    var wrap = document.createElement("div");
    wrap.className = "leds";
    ledW = document.createElement("span"); ledW.className = "led";
    ledW.innerHTML = "<i></i>" + t("led.wasm"); ledW.dataset.tip = t("led.tip.wasm");
    ledW.addEventListener("click", probeWasm);
    ledL = document.createElement("span"); ledL.className = "led";
    ledL.innerHTML = "<i></i>" + t("led.lattice"); ledL.dataset.tip = t("led.tip.lattice");
    ledL.addEventListener("click", probeLlm);
    wrap.appendChild(ledW); wrap.appendChild(ledL);
    var langBtn = document.createElement("span");
    langBtn.id = "lang-btn"; langBtn.className = "lang-btn";
    langBtn.textContent = state.lang === "zh" ? "中" : "EN";
    langBtn.dataset.tip = "EN ⇄ 繁體中文 — the desk's second tongue";
    langBtn.addEventListener("click", function () {
      setLang(state.lang === "zh" ? "en" : "zh");
      toast(state.lang === "zh" ? t("term.langset") : t("term.langset.en"));
      sfx.toast();
    });
    wrap.appendChild(langBtn);
    bar.insertBefore(wrap, bar.querySelector(".clock"));
    probeWasm(); probeLlm();
  })();

  function openSysmon() {
    var title = "sysmon — the instruments";
    if (openWins[title]) { focus(openWins[title]); return; }
    var pre = document.createElement("pre");
    pre.style.margin = "0"; pre.style.whiteSpace = "pre-wrap";
    var box = document.createElement("div");
    box.className = "win-body console";
    box.appendChild(pre);
    var win = makeWindow(title, box);
    win.style.width = "30rem"; win.style.height = "24rem";
    var frames = 0, fps = 0, lastT = performance.now();
    function counter(t) {
      if (!win.isConnected) return;
      frames++;
      if (t - lastT > 1000) { fps = frames; frames = 0; lastT = t; }
      requestAnimationFrame(counter);
    }
    requestAnimationFrame(counter);
    var iv = setInterval(function () {
      if (!win.isConnected) { clearInterval(iv); return; }
      pre.textContent =
        "SYSMON — desk telemetry\n─────────────────────────────\n" +
        "uptime        " + fmtTime(Math.floor((Date.now() - sessionStart) / 1000)) + "\n" +
        "frame rate    " + fps + " fps\n" +
        "windows       " + document.querySelectorAll(".win").length + " open\n" +
        "wasm core     " + (wasmAlive === null ? "probing…" : wasmAlive ? "ALIVE · 421 nodes" : "ABSENT") + "\n" +
        "lattice link  " + (llmAlive === null ? "probing…" : llmAlive ? "OLLAMA RESIDENT" : "no :11434 — offline") + "\n" +
        "livery        " + THEMES[state.theme].label + "\n" +
        "clearance     L" + clearance() + " · " + state.xp + "xp\n" +
        "eggs          " + state.eggs.length + "/" + eggTotal() + " · achievements " +
          state.achievements.length + "/" + Object.keys(ACHIEVEMENTS).length + "\n" +
        "audio         " + (state.muted ? "muted" : "live") + "\n" +
        "─────────────────────────────\n" +
        "every number here is measured, not claimed.";
    }, 500);
    achieve("sysmon");
  }

  /* ---------- command palette: Ctrl+K, the fast drawer (iter 30) ---------- */

  var palEl = null;
  function paletteItems() {
    var items = [];
    Object.keys(TITLES).forEach(function (p) {
      items.push({ n: TITLES[p] + " — " + p, act: function () { openDoc(p, TITLES[p]); } });
    });
    items.push({ n: "terminal — fano:~$", act: openTerm });
    items.push({ n: "quplink — sandbox uplink", act: function () { if (window.QUPLINK) window.QUPLINK.open(); } });
    items.push({ n: "rations.os — air-gap web platform", act: function () { openDoc("apps/rations/quine.html", "rations.os"); } });
    items.push({ n: "admiralty.suite — board of admiralty", act: openAdmiralty });
    items.push({ n: "comms.os — wire · messenger · tradecraft", act: function () { if (window.FANO_COMMS) window.FANO_COMMS.open(); } });
    items.push({ n: "qstar.pet — the thinking cap", act: openPet });
    items.push({ n: "sysmon — the instruments", act: openSysmon });
    items.push({ n: "field manual — service record", act: openManual });
    items.push({ n: "7q.drawer — SEALED", act: deniedMenu });
    Object.keys(THEMES).forEach(function (t) {
      items.push({ n: "livery: " + THEMES[t].label, act: function () { setTheme(t); toast("livery: " + THEMES[t].label); } });
    });
    if (window.QUVIZ) window.QUVIZ.vizPaneList().forEach(function (v) {
      items.push({ n: "viz: " + v, act: function () { window.QUVIZ.openViz(v); } });
    });
    return items;
  }
  function openPalette() {
    if (palEl) { palEl.remove(); palEl = null; return; }
    palEl = document.createElement("div");
    palEl.id = "palette";
    palEl.innerHTML = '<input class="pal-in" placeholder="' + t("pal.ph") + '">';
    var list = document.createElement("div");
    list.className = "pal-list";
    palEl.appendChild(list);
    document.body.appendChild(palEl);
    var inp = palEl.querySelector(".pal-in");
    var items = paletteItems(), sel = 0;
    function draw() {
      var q = inp.value.trim().toLowerCase();
      var hits = items.filter(function (i) { return i.n.toLowerCase().indexOf(q) >= 0; }).slice(0, 9);
      list.innerHTML = "";
      hits.forEach(function (h, i) {
        var d = document.createElement("div");
        d.className = "pal-item" + (i === sel ? " on" : "");
        d.textContent = h.n;
        d.addEventListener("click", function () { pick(h); });
        list.appendChild(d);
      });
      if (!hits.length) list.innerHTML = '<div class="pal-item">' + t("pal.none") + "</div>";
      return hits;
    }
    function pick(h) { palEl.remove(); palEl = null; if (h) h.act(); }
    inp.addEventListener("input", function () { sel = 0; draw(); });
    inp.addEventListener("keydown", function (e) {
      e.stopPropagation();
      var hits = items.filter(function (i) { return i.n.toLowerCase().indexOf(inp.value.trim().toLowerCase()) >= 0; }).slice(0, 9);
      if (e.key === "Escape") pick(null);
      else if (e.key === "ArrowDown") { sel = Math.min(sel + 1, hits.length - 1); draw(); }
      else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); draw(); }
      else if (e.key === "Enter") pick(hits[sel]);
    });
    draw();
    setTimeout(function () { inp.focus(); }, 30);
    sfx.palette();
    egg("fastdrawer");
    state.palCount = (state.palCount || 0) + 1; save();
    if (state.palCount >= 5) achieve("paladin");
  }
  document.addEventListener("keydown", function (e) {
    if (!bootDone) return;
    if (e.key === "k" && e.ctrlKey) { e.preventDefault(); openPalette(); }
    if (e.key === "Escape" && palEl) { palEl.remove(); palEl = null; }
  });

  window.FANO = {
    openConsole: openConsole, openDoc: openDoc, toast: toast, egg: egg,
    award: award, achieve: achieve, openDenied: openDenied, openPet: openPet,
    openTerm: openTerm, makeWindow: makeWindow, sfx: sfx, col: col,
    state: function () { return state; }, save: save,
    t: t, setLang: setLang, lang: function () { return state.lang; },
  };

  tick();
  setInterval(tick, 1000);
  paintClearance();
  applyLang();
  /* cold keystore → warm it before comms are usable */
  FANO_AUTH.load().then(function () {
    if (!FANO_AUTH.session.sk) unlockPrompt();
  });
})();
