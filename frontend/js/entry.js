requireAuth();

// Greet the user with their business name
const greetingEl = document.getElementById("greeting");
if (greetingEl) {
  greetingEl.innerText = `Hi, ${getBusinessName()} 👋`;
}

const journalEntry = document.getElementById("journal-entry");
const addEntryBtn = document.getElementById("add-entry-btn");
const insightCard = document.getElementById("insight-text");
const recentList = document.getElementById("recent-records-list");
const micBtn = document.getElementById("mic-btn");

// ADD ENTRY (calls Gemma via backend) — typed entries, unchanged
async function submitEntry() {
  const text = journalEntry.value.trim();
  if (!text) return;

  const originalText = addEntryBtn.innerText;
  addEntryBtn.disabled = true;
  addEntryBtn.innerText = "Thinking...";

  try {
    const data = await apiFetch("/analyze", {
      method: "POST",
      body: JSON.stringify({ text }),
    });

    if (data.summary && insightCard) {
      insightCard.innerText = data.summary;
    }

    if (data.transactions && Array.isArray(data.transactions)) {
      data.transactions.forEach((tx) => prependRecentRecord(tx, true));
    }

    journalEntry.value = "";
    journalEntry.style.height = "auto";
  } catch (err) {
    if (insightCard) {
      insightCard.innerText = `Something went wrong: ${err.message}`;
    }
  } finally {
    addEntryBtn.disabled = false;
    addEntryBtn.innerText = originalText;
  }
}

if (addEntryBtn) {
  addEntryBtn.addEventListener("click", submitEntry);
}

// Render a new record row at the top of "Recent Records"
function formatRecordDate(dateStr) {
  if (!dateStr) return "Just now";

  const txDate = new Date(dateStr);
  if (isNaN(txDate)) return dateStr;

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(txDate, today)) return "Today";
  if (isSameDay(txDate, yesterday)) return "Yesterday";

  return txDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function prependRecentRecord(tx, isFreshlyAdded = false) {
  if (!recentList) return;

  const isIncome = tx.type === "income";
  const amountColor = isIncome ? "text-primary" : "text-error";
  const amountPrefix = isIncome ? "+" : "-";
  const iconBg = isIncome ? "bg-secondary-container/20 text-secondary" : "bg-primary-fixed/20 text-primary";
  const icon = isIncome ? "sell" : "shopping_basket";
  const dateLabel = isFreshlyAdded ? "Just now" : formatRecordDate(tx.date);

  const row = document.createElement("div");
  row.className = "bg-surface-container-low rounded-xl p-4 flex items-center justify-between hover:bg-white transition-colors cursor-pointer";
  row.innerHTML = `
    <div class="flex items-center gap-4">
      <div class="w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center">
        <span class="material-symbols-outlined">${icon}</span>
      </div>
      <div>
        <p class="font-body-md text-on-surface font-medium">${tx.description || tx.category || "Entry"}</p>
        <p class="font-label-sm text-label-sm text-outline">${dateLabel}</p>
      </div>
    </div>
    <span class="font-headline-sm text-headline-sm ${amountColor}">${amountPrefix} ₦${Number(tx.amount).toLocaleString()}</span>
  `;

  recentList.prepend(row);
}

// Load recent records on page load
async function loadRecentRecords() {
  if (!recentList) return;
  try {
    const data = await apiFetch("/transactions?limit=5", { method: "GET" });
    if (data.transactions && Array.isArray(data.transactions)) {
      recentList.innerHTML = "";
      data.transactions.forEach((tx) => prependRecentRecord(tx));
    }
  } catch (err) {
    console.warn("Could not load recent records:", err.message);
  }
}

loadRecentRecords();

// ── VOICE INPUT — records real audio and sends it to Sahara via /analyze-voice ──
//
// NOTE: this replaces the old Web Speech API approach. Web Speech API sends
// audio straight to the browser's built-in engine (Google's, in Chrome) and
// never lets us choose the model — so it can't use Sahara. MediaRecorder
// captures the raw audio ourselves, so we control exactly which speech
// model processes it.

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];

    // webm/opus is well supported across Chrome/Firefox/Edge and Sahara accepts it
    const mimeType = MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";

    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
      // Stop the mic stream so the browser mic indicator turns off
      stream.getTracks().forEach((track) => track.stop());
      const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      submitVoiceEntry(audioBlob);
    };

    mediaRecorder.start();
    isRecording = true;
    setMicListeningState(true);
  } catch (err) {
    console.error("Could not access microphone:", err);
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      alert("Microphone access was denied. Please allow microphone permission in your browser settings and try again.");
    } else {
      alert("Couldn't access your microphone. Please try again or type your entry instead.");
    }
    setMicListeningState(false);
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
  }
}

async function submitVoiceEntry(audioBlob) {
  setMicProcessingState(true);
  if (insightCard) {
    insightCard.innerText = "Listening to your recording...";
  }

  const formData = new FormData();
  formData.append("audio", audioBlob, "voice_entry.webm");
  formData.append("language", "en");

  try {
    // Raw fetch here (not apiFetch) since we're sending FormData, not JSON —
    // apiFetch always sets Content-Type: application/json, which breaks file uploads.
    const token = getToken();

    const response = await fetch(`${API_BASE_URL}/analyze-voice`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Voice entry failed.");
    }

    if (data.summary && insightCard) {
      insightCard.innerText = data.summary;
    }

    if (data.transactions && Array.isArray(data.transactions)) {
      data.transactions.forEach((tx) => prependRecentRecord(tx, true));
    }
  } catch (err) {
    console.error("Voice entry error:", err);
    if (insightCard) {
      insightCard.innerText = `Something went wrong: ${err.message}`;
    }
  } finally {
    setMicProcessingState(false);
  }
}

if (micBtn) {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder) {
    micBtn.addEventListener("click", () => {
      if (!isRecording) {
        startRecording();
      } else {
        stopRecording();
      }
    });
  } else {
    micBtn.title = "Voice input isn't supported in this browser.";
    micBtn.addEventListener("click", () => {
      alert("Voice input isn't supported in this browser. Please type your entry instead.");
    });
  }
}

function setMicListeningState(listening) {
  const ring = micBtn.querySelector(".mic-pulse");
  const icon = micBtn.querySelector(".material-symbols-outlined");

  if (listening) {
    ring.classList.replace("bg-secondary-container", "bg-error");
    icon.innerText = "graphic_eq";
    icon.style.color = "#fff";
    micBtn.classList.replace("bg-secondary-container", "bg-error");
  } else {
    ring.classList.replace("bg-error", "bg-secondary-container");
    icon.innerText = "mic";
    icon.style.color = "";
    micBtn.classList.replace("bg-error", "bg-secondary-container");
  }
}

function setMicProcessingState(processing) {
  micBtn.disabled = processing;
  const icon = micBtn.querySelector(".material-symbols-outlined");
  if (processing) {
    setMicListeningState(false);
    icon.innerText = "hourglass_top";
  } else {
    icon.innerText = "mic";
  }
}

// Textarea auto-expand
if (journalEntry) {
  journalEntry.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
  });
}