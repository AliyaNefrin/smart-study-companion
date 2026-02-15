
document.getElementById("summarize").addEventListener("click", () => {
  processText("summary");
});

document.getElementById("generateQA").addEventListener("click", () => {
  processText("qa");
});

document.getElementById("generateQuiz").addEventListener("click", () => {
  generateQuiz();
})
async function processText(mode) {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION" }, async (response) => {

    if (chrome.runtime.lastError || !response) {
      document.getElementById("original").value =
        "Error: Refresh the page and try again.";
      return;
    }

    if (!response.text || response.text.trim() === "") {
      document.getElementById("original").value = "No text selected.";
      return;
    }

    const text = response.text;
    document.getElementById("original").innerText = text;

    const keywords = await extractKeyPhrases(text);
    console.log("KEYWORDS FROM GEMINI:", keywords);

    const highlightedHTML = highlightText(text, keywords);

    document.getElementById("original").innerHTML = highlightedHTML;
    
    if (mode === "summary") {
      document.getElementById("summary").value = "Generating summary...";
    }

    const result = await callGemini(text, mode);

    if (mode === "summary") {
      document.getElementById("summary").value = result;
      saveToHistory(text,result);
    }

    else if (mode === "qa") {
      generateFlashcards(result);
    } 
  });
}


async function callGemini(text, mode) {
  let prompt = "";

  if (mode === "summary") {
    prompt = `Summarize the following text into clear bullet points:\n\n${text}`;
  } else if (mode === "qa") {
    prompt = `
From the following text, create 4 study questions and answers.

Format strictly like this:
Q1: question
A1: answer
Q2: question
A2: answer
Q3: question
A3: answer
Q4: question
A4: answer

Text:
${text}
`;
  }

  try {
    const response = await fetch("http://localhost:3000/api/gemini", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt })
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      return "Error: " + (data.error || "Failed to generate");
    }

    return data.candidates[0].content.parts[0].text;

  } catch (err) {
    return "Backend not running or unreachable.";
  }
}



/* ================= FLASHCARD MODE ================= */

function generateFlashcards(text) {
  const flashcardBox = document.getElementById("flashcards");

  flashcardBox.innerHTML = "";

  const lines = text.split("\n");

  let question = "";
  let answer = "";

  lines.forEach(line => {
    if (line.trim().startsWith("Q")) {
      question = line.trim();
    }
    if (line.trim().startsWith("A")) {
      answer = line.trim();

      const card = document.createElement("div");
      card.style.background = "#222";
      card.style.padding = "10px";
      card.style.marginBottom = "8px";
      card.style.borderRadius = "6px";
      card.style.cursor = "pointer";
      card.style.transition = "0.3s";

      const q = document.createElement("div");
      q.innerHTML = "<strong>" + question + "</strong>";

      const a = document.createElement("div");
      a.textContent = answer;
      a.style.display = "none";
      a.style.marginTop = "5px";
      a.style.color = "#4CAF50";

      card.appendChild(q);
      card.appendChild(a);

      card.addEventListener("click", () => {
        a.style.display = a.style.display === "none" ? "block" : "none";
      });

      flashcardBox.appendChild(card);
    }
  });
}


/* ================= HISTORY ================= */

function saveToHistory(original, summary) {
  chrome.storage.local.get({ "history": [] }, function (result) {
    let history = result.history;

    history.unshift({
      original,
      summary,
      time: new Date().toLocaleString()
    });

    history = history.slice(0, 5);

    chrome.storage.local.set({ history: history }, loadHistory);
  });
}

function loadHistory() {
  chrome.storage.local.get({ "history": [] }, function (result) {
    const historyBox = document.getElementById("history");
    if (!historyBox) return;

    historyBox.innerHTML = "";

    result.history.forEach(item => {
      const div = document.createElement("div");
      div.style.marginBottom = "10px";
      div.style.borderBottom = "1px solid #444";
      div.style.paddingBottom = "5px";

      div.innerHTML = `<strong>${item.time}</strong><br><em>${item.summary}</em>`;
      historyBox.appendChild(div);
    });
  });
}

document.addEventListener("DOMContentLoaded", loadHistory);

async function extractKeyPhrases(text) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `
Extract 5 to 8 important keywords or short phrases.
Return one per line, no bullets, no numbering.

Text:
${text}
          ` }] }]
        })
      }
    );

    const data = await response.json();
    const rawText = data.candidates[0].content.parts[0].text;

    // Split lines → clean → remove empty
    const keywords = rawText
      .split("\n")
      .map(k => k.trim())
      .filter(k => k.length > 0);

    console.log("RAW KEYWORDS TEXT:", rawText);
    console.log("PARSED KEYWORDS:", keywords);

    return keywords;

  } catch (error) {
    console.error("Keyword extraction failed:", error);
    return [];
  }
}


function highlightText(text, keywords) {
  let highlightedText = text;

  keywords.forEach(word => {
    const escapedWord = word.replace(/[.*+?${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escapedWord})`, "gi");
    highlightedText = highlightedText.replace(
      regex,
      `<span class="highlight">$1</span>`
    );
  });

  return highlightedText;
}

async function generateQuiz() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION" }, async (response) => {
    if (!response || !response.text) {
      alert("Please select some text first.");
      return;
    }

    document.getElementById("quizBox").innerHTML = "Generating quiz...";
    document.getElementById("submitQuiz").style.display = "none";

    const quizData = await callGeminiQuiz(response.text);
    renderQuiz(quizData);
  });
}

async function callGeminiQuiz(text) {
  const prompt = `
Create 5 multiple-choice questions from the text.

Return ONLY JSON in this exact format:
[
  {
    "question": "",
    "options": ["", "", "", ""],
    "correctIndex": 0,
    "explanation": ""
  }
]

Text:
${text}
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await response.json();
    let raw = data.candidates[0].content.parts[0].text;

    // SAFETY CLEAN
    raw = raw.substring(raw.indexOf("["), raw.lastIndexOf("]") + 1);

    return JSON.parse(raw);
  } catch (e) {
    console.error("Quiz generation failed", e);
    return [];
  }
}

let quizAnswers = [];

function renderQuiz(questions) {
  const quizBox = document.getElementById("quizBox");
  quizBox.innerHTML = "";
  quizAnswers = questions;

  questions.forEach((q, index) => {
    const div = document.createElement("div");
    div.className = "quiz-question";

    div.innerHTML = `<strong>Q${index + 1}. ${q.question}</strong>`;

    q.options.forEach((opt, i) => {
      const label = document.createElement("label");
      label.className = "quiz-option";

      label.innerHTML = `
        <input type="radio" name="q${index}" value="${i}">
        ${opt}
      `;

      div.appendChild(label);
    });

    quizBox.appendChild(div);
  });

  document.getElementById("submitQuiz").style.display = "block";
}

document.getElementById("submitQuiz").addEventListener("click", () => {
  const quizBox = document.getElementById("quizBox");

  quizAnswers.forEach((q, qIndex) => {
    const selected = document.querySelector(`input[name="q${qIndex}"]:checked`);
    const questionDiv = quizBox.children[qIndex];

    if (!selected) return;

    const selectedIndex = parseInt(selected.value);

    if (selectedIndex === q.correctIndex) {
      selected.parentElement.classList.add("correct");
    } else {
      selected.parentElement.classList.add("wrong");

      const exp = document.createElement("div");
      exp.className = "explanation";
      exp.innerHTML = `📘 ${q.explanation}`;
      questionDiv.appendChild(exp);
    }
  });
});


/*Text to speech*/
let speechUtterance = null;

document.getElementById("readText").addEventListener("click", () => {
  const text = document.getElementById("original").innerText;

  if (!text || text.trim()=== "") {
    alert("No text available to read.");
    return;
  }

  speechUtterance = new SpeechSynthesisUtterance(text);

  speechUtterance.rate = 1;
  speechUtterance.pitch = 1;
  speechUtterance.volume = 1;

  speechSynthesis.speak(speechUtterance);
});

document.getElementById("stopReading").addEventListener("click", () => {
  speechSynthesis.cancel();
});

/* ================= PDF EXPORT ================= */

document.getElementById("exportPDF").addEventListener("click", () => {
  exportToPDF();
});

function exportToPDF() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  let y = 10;

  // -------- TITLE --------
  pdf.setFontSize(16);
  pdf.text("Smart Study Companion", 10, y);
  y += 10;

  pdf.setFontSize(12);
  pdf.text(`Generated on: ${new Date().toLocaleString()}`, 10, y);
  y += 10;

  // -------- ORIGINAL TEXT --------
  const originalText = document.getElementById("original").innerText;
  if (originalText) {
    pdf.setFontSize(14);
    pdf.text("Original Text", 10, y);
    y += 8;

    pdf.setFontSize(11);
    y = addWrappedText(pdf, originalText, y);
  }

  // -------- SUMMARY --------
  const summary = document.getElementById("summary").value;
  if (summary) {
    pdf.addPage();
    y = 10;

    pdf.setFontSize(14);
    pdf.text("Summary", 10, y);
    y += 8;

    pdf.setFontSize(11);
    y = addWrappedText(pdf, summary, y);
  }

  // -------- Q&A (FLASHCARDS) --------
  const flashcards = document.getElementById("flashcards").innerText;
  if (flashcards) {
    pdf.addPage();
    y = 10;

    pdf.setFontSize(14);
    pdf.text("Questions & Answers", 10, y);
    y += 8;

    pdf.setFontSize(11);
    y = addWrappedText(pdf, flashcards, y);
  }

  // -------- QUIZ --------
  if (typeof quizAnswers !== "undefined" && quizAnswers.length > 0) {
    pdf.addPage();
    y = 10;

    pdf.setFontSize(14);
    pdf.text("Quiz", 10, y);
    y += 8;

    pdf.setFontSize(11);

    quizAnswers.forEach((q, i) => {
      y = addWrappedText(pdf, `Q${i + 1}: ${q.question}`, y);

      q.options.forEach((opt, idx) => {
        const mark = idx === q.correctIndex ? "✔" : "✖";
        y = addWrappedText(pdf, `  ${mark} ${opt}`, y);
      });

      y = addWrappedText(pdf, `Explanation: ${q.explanation}`, y);
      y += 4;
    });
  }

  // -------- SAVE --------
  pdf.save(`SmartStudy_${Date.now()}.pdf`);
}

function addWrappedText(pdf, text, y) {
  const pageWidth = pdf.internal.pageSize.width - 20;
  const lines = pdf.splitTextToSize(text, pageWidth);

  lines.forEach(line => {
    if (y > 280) {
      pdf.addPage();
      y = 10;
    }
    pdf.text(line, 10, y);
    y += 6;
  });

  return y;
}
