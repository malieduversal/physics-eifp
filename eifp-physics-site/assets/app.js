/* ==========================================================================
   EIFP Physics Self-Study Site — shared behaviour
   - LO progress is tracked per learning-objective code and saved in the
     browser's localStorage, so it survives closing the tab/computer but
     stays private to that one device/browser (no server, no login).
   - EIFP_LO_MAP lists every LO code that belongs to each subtopic group.
     Other pages (like a topic overview) can read this to compute a
     "3 / 7 complete" badge without duplicating the LO list everywhere.
   ========================================================================== */

const EIFP_STORAGE_KEY = "eifp-physics-progress-v1";

// Subtopic groups built so far. Add an entry here whenever a new LO page
// is published so overview pages can show accurate progress badges.
const EIFP_LO_MAP = {
  "1.1": ["1.1-C1", "1.1-C2", "1.1-C3", "1.1-S4", "1.1-S5", "1.1-S6", "1.1-S7"]
};

function eifpLoadProgress() {
  try {
    const raw = localStorage.getItem(EIFP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function eifpSaveProgress(state) {
  try {
    localStorage.setItem(EIFP_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* localStorage unavailable (private browsing etc.) — fail silently */
  }
}

/* ==========================================================================
   LO checklist — RAG (Red / Amber / Green) self-assessment.
   Cambridge's own student guides use this three-colour self-reflection
   scale instead of a plain done/not-done tick, so a student's checklist
   status here is one of "red" | "amber" | "green" | undefined (not yet
   rated) rather than a boolean.

   Each page can show TWO checklists for the same LO group: a "pre" one
   near the top ("before you start") and a "post" one near the bottom
   ("after you finish"). These are deliberately two separate ratings, not
   two synced copies of one rating — that's what makes a before/after
   comparison possible. Storage key per rating is `<loCode>__<phase>`,
   e.g. "1.1-C1__pre" and "1.1-C1__post", both inside the same
   EIFP_STORAGE_KEY blob.
   ========================================================================== */
function eifpRagKey(code, phase) {
  return code + "__" + phase;
}

function eifpGroupProgress(groupId) {
  // Used for overview-page badges. Prefers the "post" (after-finishing)
  // rating where available, since that reflects the student's latest
  // self-assessment; falls back to "pre" if they haven't rated again yet.
  const codes = EIFP_LO_MAP[groupId] || [];
  const state = eifpLoadProgress();
  const green = codes.filter((c) => {
    const rag = state[eifpRagKey(c, "post")] || state[eifpRagKey(c, "pre")];
    return rag === "green";
  }).length;
  return { done: green, total: codes.length };
}

/* A page can show the SAME set of learning objectives in two checklist
   containers — one tagged `data-rag-phase="pre"`, one tagged
   `data-rag-phase="post"` — so students don't have to scroll back up to
   revisit their first rating. Each container is self-contained (its own
   progress bar / label / reset button, found via
   `container.querySelector(...)` rather than a page-wide
   `document.querySelector(...)`), but they read/write different phases of
   the same LO codes, which is what makes the before/after comparison
   below possible. */

function eifpRenderChecklistInstance(container) {
  const list = container.querySelector("[data-lo-list]");
  if (!list) return;
  const phase = container.getAttribute("data-rag-phase") || "pre";
  const state = eifpLoadProgress();
  const items = Array.from(list.querySelectorAll(".lo-item"));
  const segGreen = container.querySelector("[data-seg-green]");
  const segAmber = container.querySelector("[data-seg-amber]");
  const segRed = container.querySelector("[data-seg-red]");
  const label = container.querySelector("[data-progress-label]");

  let g = 0, a = 0, r = 0;
  items.forEach((item) => {
    const code = item.getAttribute("data-lo-code");
    const status = state[eifpRagKey(code, phase)] || "";
    item.setAttribute("data-rag-status", status);
    item.querySelectorAll(".rag-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-rag") === status);
    });
    if (status === "green") g++;
    else if (status === "amber") a++;
    else if (status === "red") r++;
  });

  const total = items.length;
  if (segGreen) segGreen.style.width = total ? (g / total) * 100 + "%" : "0%";
  if (segAmber) segAmber.style.width = total ? (a / total) * 100 + "%" : "0%";
  if (segRed) segRed.style.width = total ? (r / total) * 100 + "%" : "0%";
  if (label) {
    const rated = g + a + r;
    if (rated === 0) {
      label.textContent = "Not yet self-assessed";
    } else if (g === total) {
      label.textContent = "🟢 All " + total + " objectives rated green";
    } else {
      label.textContent = g + " green · " + a + " amber · " + r + " red · " + (total - rated) + " not yet rated";
    }
  }
}

/* ---------- Before vs after comparison table ---------- */
const EIFP_RAG_RANK = { red: 1, amber: 2, green: 3 };
const EIFP_RAG_LABEL = { red: "Red", amber: "Amber", green: "Green" };

function eifpBuildLoTextMap(groupId) {
  // LO wording lives in the HTML (once per checklist copy). Reuse the
  // first copy found rather than hard-coding the text a third time.
  const map = {};
  document.querySelectorAll(".lo-item[data-lo-code]").forEach((item) => {
    const code = item.getAttribute("data-lo-code");
    if (map[code]) return;
    const textEl = item.querySelector(".lo-text");
    if (!textEl) return;
    const clone = textEl.cloneNode(true);
    const codeTag = clone.querySelector(".lo-code");
    if (codeTag) codeTag.remove();
    map[code] = clone.textContent.trim();
  });
  return map;
}

function eifpRenderComparison(container) {
  const groupId = container.getAttribute("data-rag-compare");
  const codes = EIFP_LO_MAP[groupId] || [];
  if (!codes.length) return;
  const state = eifpLoadProgress();
  const textMap = eifpBuildLoTextMap(groupId);

  let improved = 0, same = 0, dropped = 0, incomplete = 0;
  const rows = codes.map((code) => {
    const pre = state[eifpRagKey(code, "pre")] || "";
    const post = state[eifpRagKey(code, "post")] || "";
    let changeHtml = '<span class="rag-change none">Not yet comparable</span>';

    if (pre && post) {
      const delta = EIFP_RAG_RANK[post] - EIFP_RAG_RANK[pre];
      if (delta > 0) {
        improved++;
        changeHtml = '<span class="rag-change up">&#9650; Improved</span>';
      } else if (delta < 0) {
        dropped++;
        changeHtml = '<span class="rag-change down">&#9660; Dropped</span>';
      } else {
        same++;
        changeHtml = '<span class="rag-change flat">No change</span>';
      }
    } else if (pre && !post) {
      incomplete++;
      changeHtml = '<span class="rag-change none">Rate again below</span>';
    } else if (!pre && post) {
      incomplete++;
      changeHtml = '<span class="rag-change none">No "before" rating</span>';
    } else {
      incomplete++;
    }

    const pillHtml = (rag) => rag
      ? '<span class="rag-pill rag-pill-' + rag + '">' + EIFP_RAG_LABEL[rag] + "</span>"
      : '<span class="rag-pill rag-pill-none">—</span>';

    return (
      '<div class="rag-compare-row">' +
        '<div class="rag-compare-text">' + (textMap[code] || code) + "</div>" +
        '<div class="rag-compare-before">' + pillHtml(pre) + "</div>" +
        '<div class="rag-compare-arrow">&rarr;</div>' +
        '<div class="rag-compare-after">' + pillHtml(post) + "</div>" +
        '<div class="rag-compare-change">' + changeHtml + "</div>" +
      "</div>"
    );
  }).join("");

  const rated = improved + same + dropped;
  let summary;
  if (rated === 0 && incomplete === codes.length) {
    summary = "Rate yourself at both the top and bottom of the page to see your progress here.";
  } else {
    const parts = [];
    if (improved) parts.push("🎉 " + improved + " improved");
    if (same) parts.push(same + " stayed the same");
    if (dropped) parts.push(dropped + " dropped");
    if (incomplete) parts.push(incomplete + " not yet comparable");
    summary = parts.join(" · ");
  }

  container.innerHTML =
    '<div class="rag-compare-summary">' + summary + "</div>" +
    '<div class="rag-compare-header">' +
      "<div></div><div>Before</div><div></div><div>After</div><div>Change</div>" +
    "</div>" +
    rows;
}

function eifpSyncAllChecklists() {
  document.querySelectorAll(".lo-checklist").forEach(eifpRenderChecklistInstance);
  document.querySelectorAll("[data-rag-compare]").forEach(eifpRenderComparison);
}

function eifpInitChecklist() {
  document.querySelectorAll(".lo-checklist").forEach((container) => {
    const list = container.querySelector("[data-lo-list]");
    if (!list) return;
    const phase = container.getAttribute("data-rag-phase") || "pre";
    list.querySelectorAll(".lo-item").forEach((item) => {
      const code = item.getAttribute("data-lo-code");
      item.querySelectorAll(".rag-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const rag = btn.getAttribute("data-rag");
          const current = eifpLoadProgress();
          current[eifpRagKey(code, phase)] = rag;
          eifpSaveProgress(current);
          eifpSyncAllChecklists(); // also refreshes the before/after comparison
        });
      });
    });
  });
  eifpSyncAllChecklists();
}

/* ---------- Reset button(s): clears this checklist's own phase only,
   so resetting "before" doesn't wipe out an "after" rating or vice versa ---------- */
function eifpInitResetButton() {
  document.querySelectorAll("[data-rag-reset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const container = btn.closest(".lo-checklist");
      const list = container ? container.querySelector("[data-lo-list]") : document.querySelector("[data-lo-list]");
      if (!list || !container) return;
      const phase = container.getAttribute("data-rag-phase") || "pre";
      const groupId = list.getAttribute("data-lo-list");
      const codes = EIFP_LO_MAP[groupId] || [];
      const current = eifpLoadProgress();
      codes.forEach((code) => { delete current[eifpRagKey(code, phase)]; });
      eifpSaveProgress(current);
      eifpSyncAllChecklists();
    });
  });
}

/* ---------- Progress badges on overview pages (e.g. topic-1.html) ---------- */
function eifpInitOverviewBadges() {
  document.querySelectorAll("[data-progress-badge]").forEach((el) => {
    const groupId = el.getAttribute("data-progress-badge");
    const { done, total } = eifpGroupProgress(groupId);
    if (total === 0) return; // page not built yet, leave the "coming soon" badge as-is
    el.textContent = done + " / " + total + " green";
    el.classList.remove("badge-soon");
    if (done === total) {
      el.style.background = "#DCE9F0";
      el.style.color = "#2b5a75";
      el.style.borderColor = "#B7D2E0";
    }
  });
}

/* ---------- Local file:// video fallback ----------
   YouTube's embedded player refuses to run when a page is opened via
   file:// (no valid web origin) — it shows a cryptic "Error 153" instead
   of the video. We can't fix that with more embed code; instead, detect
   the local-file case and swap in a clear message + direct link so local
   testing doesn't look broken. Once hosted on a real https:// address,
   this function does nothing and the normal embed plays as usual. */
function eifpInitVideoFallback() {
  if (window.location.protocol !== "file:") return;
  document.querySelectorAll(".video-frame").forEach((frame) => {
    const wrapper = frame.closest(".media-primary") || frame.parentElement;
    const watchLink = wrapper ? wrapper.querySelector('a[href*="youtube.com/watch"]') : null;
    const href = watchLink ? watchLink.getAttribute("href") : "#";
    frame.classList.add("video-frame-local");
    frame.innerHTML =
      '<div class="video-fallback-note">' +
        '<p class="vf-title">📺 Local preview mode</p>' +
        "<p>YouTube can't play embedded videos from a file opened directly on your computer. " +
        "This works normally once the page is hosted on a real web address — for now, use the link below.</p>" +
        '<a class="btn" target="_blank" rel="noopener" href="' + href + '">Watch on YouTube ↗</a>' +
      "</div>";
  });
}

/* ---------- Optional inline simulation embed toggle ---------- */
function eifpInitSimToggles() {
  document.querySelectorAll("[data-sim-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetSel = btn.getAttribute("data-sim-toggle");
      const frame = document.querySelector(targetSel);
      if (!frame) return;
      const showing = frame.classList.toggle("show");
      if (showing && !frame.src) {
        frame.src = frame.getAttribute("data-src");
      }
      btn.textContent = showing ? "Hide simulation" : "Try it here on this page";
    });
  });
}

/* ---------- Flashcards (click/tap to flip) ---------- */
function eifpInitFlashcards() {
  document.querySelectorAll(".flash-card").forEach((card) => {
    card.addEventListener("click", () => card.classList.toggle("flipped"));
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        card.classList.toggle("flipped");
      }
    });
  });
  const resetBtn = document.querySelector("[data-flash-reset]");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      document.querySelectorAll(".flash-card.flipped").forEach((c) => c.classList.remove("flipped"));
    });
  }
}

/* ==========================================================================
   Quiz engine — auto-graded, "repeat until 100%" style.
   Markup contract per quiz:
   <div class="quiz" data-quiz="1.1-theory">
     <div class="quiz-q" data-type="mcq" data-correct="1">
       <p class="quiz-q-text">...</p>
       <div class="quiz-options">
         <button class="quiz-opt" data-idx="0">...</button>
         <button class="quiz-opt" data-idx="1">...</button>
       </div>
       <div class="quiz-feedback"></div>
     </div>
     <div class="quiz-q" data-type="numeric" data-answer="1.8" data-tolerance="0.05">
       <p class="quiz-q-text">...</p>
       <input class="quiz-input" type="number" step="any">
       <div class="quiz-feedback"></div>
     </div>
     <div class="quiz-actions">
       <button class="btn quiz-submit">Check my answers</button>
       <button class="btn-outline quiz-retry" hidden>Try again</button>
     </div>
     <div class="quiz-result"></div>
   </div>
   Passing a quiz (100%) is remembered in localStorage per data-quiz id, and
   is read by eifpRefreshReadyStatus() to show the "ready to move on" banner.
   ========================================================================== */

const EIFP_QUIZ_KEY = "eifp-quiz-progress-v1";

function eifpLoadQuizState() {
  try {
    const raw = localStorage.getItem(EIFP_QUIZ_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
function eifpSaveQuizState(state) {
  try { localStorage.setItem(EIFP_QUIZ_KEY, JSON.stringify(state)); } catch (e) {}
}

/* Optional "what kind of mistake was this?" tagging, shown next to any
   answer marked wrong. This is cheap to capture (no backend, just another
   localStorage blob) but is more useful to a teacher than a bare score:
   "half the class tagged Concept on Q3" points at what to re-teach, while
   "mostly Careless" doesn't. Modelled on the mistake-type checkboxes in
   the AS-level Personalised Learning guide's "Fix My Thinking" section. */
const EIFP_MISTAKE_KEY = "eifp-mistake-log-v1";

function eifpLoadMistakes() {
  try {
    const raw = localStorage.getItem(EIFP_MISTAKE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
function eifpSaveMistakes(state) {
  try { localStorage.setItem(EIFP_MISTAKE_KEY, JSON.stringify(state)); } catch (e) {}
}

function eifpInitQuizzes() {
  document.querySelectorAll(".quiz").forEach((quizEl) => {
    const quizId = quizEl.getAttribute("data-quiz");
    const questions = Array.from(quizEl.querySelectorAll(".quiz-q"));
    const submitBtn = quizEl.querySelector(".quiz-submit");
    const retryBtn = quizEl.querySelector(".quiz-retry");
    const resultEl = quizEl.querySelector(".quiz-result");

    // MCQ option selection
    questions.forEach((q) => {
      if (q.getAttribute("data-type") === "mcq") {
        q.querySelectorAll(".quiz-opt").forEach((opt) => {
          opt.addEventListener("click", () => {
            q.querySelectorAll(".quiz-opt").forEach((o) => o.classList.remove("selected"));
            opt.classList.add("selected");
          });
        });
      }
    });

    function grade() {
      let correctCount = 0;
      questions.forEach((q) => {
        const type = q.getAttribute("data-type");
        const feedback = q.querySelector(".quiz-feedback");
        let isCorrect = false;
        let correctText = "";

        if (type === "mcq") {
          const correctIdx = q.getAttribute("data-correct");
          const selected = q.querySelector(".quiz-opt.selected");
          const correctOpt = q.querySelector('.quiz-opt[data-idx="' + correctIdx + '"]');
          correctText = correctOpt ? correctOpt.textContent.trim() : "";
          isCorrect = !!selected && selected.getAttribute("data-idx") === correctIdx;
        } else if (type === "numeric") {
          const answer = parseFloat(q.getAttribute("data-answer"));
          const tolerance = parseFloat(q.getAttribute("data-tolerance") || "0");
          const unit = q.getAttribute("data-unit") || "";
          const input = q.querySelector(".quiz-input");
          const val = input ? parseFloat(input.value) : NaN;
          correctText = answer + (unit ? " " + unit : "");
          isCorrect = !isNaN(val) && Math.abs(val - answer) <= tolerance;
        }

        q.classList.toggle("correct", isCorrect);
        q.classList.toggle("incorrect", !isCorrect);
        if (feedback) {
          feedback.className = "quiz-feedback " + (isCorrect ? "correct" : "incorrect");
          if (isCorrect) {
            feedback.textContent = "Correct.";
          } else {
            const qNoEl = q.querySelector(".q-no");
            const qNo = qNoEl ? qNoEl.textContent.trim() : String(questions.indexOf(q) + 1);
            const mistakeKey = quizId + ":" + qNo;
            feedback.innerHTML =
              "Not quite — correct answer: " + correctText +
              '<div class="mistake-tag-group" data-mistake-key="' + mistakeKey + '">' +
                '<span class="mistake-tag-label">What kind of mistake was this? (optional)</span>' +
                '<button type="button" class="mistake-tag-btn" data-mistake-type="concept">Concept</button>' +
                '<button type="button" class="mistake-tag-btn" data-mistake-type="formula">Formula</button>' +
                '<button type="button" class="mistake-tag-btn" data-mistake-type="careless">Careless</button>' +
              "</div>";
          }
        }
        if (isCorrect) correctCount++;
      });

      // Wire up mistake-type buttons freshly created above (each grade()
      // call rebuilds the feedback markup, so listeners are (re)bound here).
      quizEl.querySelectorAll(".mistake-tag-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const group = btn.closest(".mistake-tag-group");
          if (!group) return;
          const key = group.getAttribute("data-mistake-key");
          group.querySelectorAll(".mistake-tag-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          const mistakes = eifpLoadMistakes();
          mistakes[key] = btn.getAttribute("data-mistake-type");
          eifpSaveMistakes(mistakes);
        });
      });

      const total = questions.length;
      const state = eifpLoadQuizState();
      if (resultEl) {
        resultEl.classList.add("show");
        if (correctCount === total) {
          resultEl.className = "quiz-result show pass";
          resultEl.textContent = "🎉 " + correctCount + " / " + total + " — 100%! You're ready to move on.";
          state[quizId] = true;
        } else {
          resultEl.className = "quiz-result show fail";
          resultEl.textContent = correctCount + " / " + total + " correct. Review the ones marked ✗ above, then try again — aim for 100% before moving on.";
          state[quizId] = false;
        }
      }
      eifpSaveQuizState(state);
      eifpRefreshReadyStatus();

      if (submitBtn) submitBtn.hidden = true;
      if (retryBtn) retryBtn.hidden = false;
    }

    function reset() {
      questions.forEach((q) => {
        q.classList.remove("correct", "incorrect");
        q.querySelectorAll(".quiz-opt").forEach((o) => o.classList.remove("selected"));
        const input = q.querySelector(".quiz-input");
        if (input) input.value = "";
        const feedback = q.querySelector(".quiz-feedback");
        if (feedback) { feedback.textContent = ""; feedback.className = "quiz-feedback"; }
      });
      if (resultEl) { resultEl.classList.remove("show", "pass", "fail"); resultEl.textContent = ""; }
      if (submitBtn) submitBtn.hidden = false;
      if (retryBtn) retryBtn.hidden = true;
    }

    if (submitBtn) submitBtn.addEventListener("click", grade);
    if (retryBtn) retryBtn.addEventListener("click", reset);
  });
}

/* ---------- "Ready to move on?" status banner, reads quiz pass state ---------- */
function eifpRefreshReadyStatus() {
  const state = eifpLoadQuizState();
  document.querySelectorAll("[data-status-pill]").forEach((pill) => {
    const quizId = pill.getAttribute("data-status-pill");
    const passed = state[quizId] === true;
    pill.textContent = (passed ? "✓ " : "○ ") + pill.getAttribute("data-label");
    pill.classList.toggle("pass", passed);
    pill.classList.toggle("pending", !passed);
  });
  const readyBanner = document.querySelector("[data-ready-banner]");
  if (readyBanner) {
    const requiredQuizzes = (readyBanner.getAttribute("data-requires") || "").split(",").filter(Boolean);
    const allPassed = requiredQuizzes.length > 0 && requiredQuizzes.every((id) => state[id] === true);
    readyBanner.textContent = allPassed
      ? "✅ Both checks passed at 100% — you're ready to move on to the next subtopic."
      : "⏳ Score 100% on both checks above before moving on. Repeat them as many times as you need — that's normal.";
    readyBanner.classList.toggle("pass", allPassed);
    readyBanner.classList.toggle("pending", !allPassed);
  }
}

/* ==========================================================================
   Reflection — a few short guided prompts a student fills in near the end
   of a topic, meant to actually be readable by a teacher (unlike the RAG
   colours, which are just a quick signal). Saved per subtopic group, keyed
   by field name. Currently local-device-only — there's no backend yet —
   but the shape (one small object per group) is ready to sync to a future
   teacher-facing tracker without restructuring.
   ========================================================================== */
const EIFP_REFLECT_KEY = "eifp-reflection-v1";

function eifpLoadReflection() {
  try {
    const raw = localStorage.getItem(EIFP_REFLECT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
function eifpSaveReflection(state) {
  try { localStorage.setItem(EIFP_REFLECT_KEY, JSON.stringify(state)); } catch (e) {}
}

function eifpInitReflection() {
  document.querySelectorAll("[data-reflect]").forEach((block) => {
    const groupId = block.getAttribute("data-reflect");
    const saved = eifpLoadReflection()[groupId] || {};
    const statusEl = block.querySelector("[data-reflect-saved]");
    let saveTimer = null;

    const fields = Array.from(block.querySelectorAll("[data-reflect-field]"));
    fields.forEach((field) => {
      const key = field.getAttribute("data-reflect-field");
      if (saved[key]) field.value = saved[key];

      field.addEventListener("input", () => {
        if (statusEl) statusEl.textContent = "Saving…";
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          const current = eifpLoadReflection();
          if (!current[groupId]) current[groupId] = {};
          current[groupId][key] = field.value;
          eifpSaveReflection(current);
          if (statusEl) statusEl.textContent = "✓ Saved on this device";
        }, 500);
      });
    });

    const hasSavedContent = fields.some((f) => saved[f.getAttribute("data-reflect-field")]);
    if (statusEl && hasSavedContent) statusEl.textContent = "✓ Saved on this device";
  });
}

/* Each init function runs independently — if one throws (e.g. a page is
   missing a section this script expects), it's logged to the console but
   does NOT stop the rest from running. Without this, a single error early
   in the list would silently disable everything after it. If something on
   the page still doesn't respond to clicks, open the browser console
   (F12 or Cmd+Option+J) and check for a red error message naming which
   function failed. */
function eifpSafeRun(fn) {
  try {
    fn();
  } catch (err) {
    console.error("EIFP site: " + fn.name + " failed:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  eifpSafeRun(eifpInitChecklist);
  eifpSafeRun(eifpInitResetButton);
  eifpSafeRun(eifpInitOverviewBadges);
  eifpSafeRun(eifpInitSimToggles);
  eifpSafeRun(eifpInitVideoFallback);
  eifpSafeRun(eifpInitFlashcards);
  eifpSafeRun(eifpInitQuizzes);
  eifpSafeRun(eifpRefreshReadyStatus);
  eifpSafeRun(eifpInitReflection);
});
