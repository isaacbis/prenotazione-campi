// --- API EXPRESS ---
const API_BASE = ""; // stessa origine: /api/...

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${path} -> ${res.status} ${text}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} -> ${res.status} ${text}`);
  }
  return res.json();
}

async function apiPatch(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PATCH ${path} -> ${res.status} ${text}`);
  }
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PUT ${path} -> ${res.status} ${text}`);
  }
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(API_BASE + path, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DELETE ${path} -> ${res.status} ${text}`);
  }
  return res.json().catch(() => ({}));
}

// --- STATO GLOBALE ---
let currentUser = null;
let lastLoadedDate = null;
let lastLoadedFieldConfig = null;
let bookingInProgress = false;

// --- UTIL BASE ---
function getTodayDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSelectedDate() {
  const dateInput = document.getElementById("booking-date");
  if (!dateInput || !dateInput.value) return getTodayDate();
  return dateInput.value;
}

function showNotification(message, type = "info") {
  const container = document.getElementById("notification-container");
  if (!container) return;

  const div = document.createElement("div");
  div.className = `notification ${type}`;
  div.textContent = message;

  container.appendChild(div);
  setTimeout(() => {
    if (div.parentNode === container) {
      container.removeChild(div);
    }
  }, 3500);
}

function toggleSections(isLoggedIn) {
  const loginArea = document.getElementById('login-area');
  const appArea = document.getElementById('app-area');

  if (!loginArea || !appArea) return;

  loginArea.style.display = isLoggedIn ? 'none' : 'flex';
  appArea.style.display = isLoggedIn ? 'block' : 'none';

  if (isLoggedIn) {
    window.scrollTo(0, 0);
  }
}

// --- LOGIN / LOGOUT ---
function login() {
  const username = document.getElementById('username')?.value.trim();
  const password = document.getElementById('password')?.value.trim();

  if (!username || !password) {
    showNotification("Inserisci username e password.", "warn");
    return;
  }

  authenticateUserFromServer(username, password);
}

function authenticateUserFromServer(username, password) {
  apiPost("/api/login", { username, password })
    .then(data => {
      currentUser = {
        username: data.username,
        role: data.role || "user"
      };

      toggleSections(true);
      toggleAdminSection();
      showNotification(`Benvenuto, ${data.username}!`, "success");

      loadReservationsForSelectedDate();

      checkAndResetAfterSevenFifty();
      loadDailyWeather(6);

      startUserCreditsListener();
      if (currentUser.role === "admin") {
        startAdminCreditsListener();
      }

      setupBuyCreditsButtons();
    })
    .catch(err => {
      console.error("Errore login:", err);
      showNotification("Errore durante il login.", "error");
    });
}

function logout() {
  if (!confirm("Vuoi davvero uscire?")) return;

  apiPost("/api/logout", {})
    .catch(err => {
      console.error("Errore logout:", err);
    })
    .finally(() => {
      currentUser = null;
      toggleSections(false);
      toggleAdminSection();
      showNotification("Disconnessione effettuata.", "success");
    });
}

// --- ADMIN SECTION (visibilità) ---
function toggleAdminSection() {
  const adminSection = document.getElementById('admin-area');
  const adminNotes = document.getElementById('admin-notes');
  const userReservationsSection = document.getElementById('user-reservations-section');
  const buyCreditsSection = document.getElementById('buy-credits-section');
  const userCreditsSection = document.getElementById('user-credits-section');
  const body = document.body;

  // box interni specifici dell'area admin
  const adminUtentiBox  = document.getElementById('admin-utenti');
  const adminCreditiBox = document.getElementById('admin-crediti');

  if (currentUser && currentUser.role === 'admin') {
    if (adminSection) adminSection.style.display = 'block';
    if (adminNotes) {
      adminNotes.style.display = 'block';
      adminNotes.addEventListener('input', saveAdminNotes);
    }
    if (userReservationsSection) userReservationsSection.style.display = 'none';
    if (buyCreditsSection) buyCreditsSection.style.display = 'none';
    if (userCreditsSection) userCreditsSection.style.display = 'none';
    body.classList.add('admin-visible');

    // apri di default le sotto-sezioni principali
    if (adminUtentiBox)  adminUtentiBox.classList.remove('hidden');
    if (adminCreditiBox) adminCreditiBox.classList.remove('hidden');

    // popola tabella utenti
    if (typeof populateCredentialsTable === 'function') {
      populateCredentialsTable();
    }
  } else {
    if (adminSection) adminSection.style.display = 'none';
    if (adminNotes) {
      adminNotes.style.display = 'none';
      adminNotes.removeEventListener('input', saveAdminNotes);
    }
    if (userReservationsSection) userReservationsSection.style.display = 'block';
    if (buyCreditsSection) buyCreditsSection.style.display = 'block';
    if (userCreditsSection) userCreditsSection.style.display = 'block';
    body.classList.remove('admin-visible');
  }
}

// --- CREDITS UTENTE / ADMIN ---
async function updateUserCreditsUI() {
  if (!currentUser) return;

  apiGet(`/api/users/${currentUser.username}/credits`)
    .then(data => {
      const credits = data.credits ?? 0;
      const el = document.getElementById("user-credits");
      if (el) el.textContent = `Crediti: ${credits}`;
    })
    .catch(err => {
      console.error("Errore nel recupero crediti utente:", err);
    });
}

function startUserCreditsListener() {
  // niente realtime: aggiorniamo solo una volta al login
  updateUserCreditsUI();
}

async function startAdminCreditsListener() {
  const tbody = document.getElementById('credits-table');
  if (!tbody) return;

  try {
    const users = await apiGet("/api/users");
    users.sort((a, b) => {
      const getNum = (id) => {
        const lower = id.toLowerCase();
        if (lower.startsWith("ombrellone")) {
          const numStr = id.slice("ombrellone".length);
          const n = parseInt(numStr, 10);
          return isNaN(n) ? 999999 : n;
        } else if (lower.startsWith("user")) {
          const numStr = id.slice(4);
          const n = parseInt(numStr, 10);
          return isNaN(n) ? 999999 : n;
        } else {
          return 999999;
        }
      };
      return getNum(a.username) - getNum(b.username);
    });

    tbody.innerHTML = "";

    users.forEach(u => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.username}</td>
        <td>${u.credits ?? 0}</td>
        <td>
          <button onclick="openAdminCreditModal('${u.username}', ${u.credits ?? 0})">
            <i class="fas fa-coins"></i> Modifica
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Errore caricamento crediti utenti:", err);
  }
}

function openAdminCreditModal(username, currentCredits) {
  const amount = prompt(`Imposta i crediti per ${username} (valore attuale: ${currentCredits})`);
  if (amount === null) return;
  const newVal = parseInt(amount, 10);
  if (isNaN(newVal) || newVal < 0) {
    showNotification("Valore crediti non valido.", "error");
    return;
  }

  apiPatch(`/api/users/${username}/credits`, { set: newVal })
    .then(() => {
      showNotification(`Crediti aggiornati per ${username} a ${newVal}.`, "success");
      if (currentUser && currentUser.username === username) {
        updateUserCreditsUI();
      }
      startAdminCreditsListener();
    })
    .catch(err => {
      console.error("Errore aggiornamento crediti admin:", err);
      showNotification("Errore nell'aggiornamento dei crediti.", "error");
    });
}

// --- COMPRA CREDITI (Stripe client-side stub) ---
function setupBuyCreditsButtons() {
  const buttons = document.querySelectorAll("[data-credits]");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const credits = parseInt(btn.getAttribute("data-credits"), 10);
      if (!currentUser) {
        showNotification("Effettua il login per acquistare crediti.", "warn");
        return;
      }

      // Qui ora salviamo solo "pending" lato client
      localStorage.setItem(
        "pendingCreditPurchase",
        JSON.stringify({
          username: currentUser.username,
          date: new Date().toISOString(),
          credits
        })
      );

      // TODO: qui andrebbe integrata la chiamata a /api/payments/create-checkout-session
      showNotification(
        `Simulazione acquisto di ${credits} crediti. (Stripe lato server da integrare)`,
        "info"
      );
    });
  });
}

// --- NOTE ADMIN ---
function loadAdminNotes() {
  apiGet("/api/admin/notes")
    .then(data => {
      const text = data.text || "";
      const notesEl = document.getElementById("admin-notes-text");
      if (notesEl) {
        notesEl.textContent = text;
      }
      const textarea = document.getElementById("admin-notes");
      if (textarea) {
        textarea.value = text;
      }
    })
    .catch(err => {
      console.error("Errore nel caricamento delle note admin:", err);
    });
}

function saveAdminNotes() {
  if (!(currentUser && currentUser.role === "admin")) return;

  const textarea = document.getElementById("admin-notes");
  if (!textarea) return;
  const text = textarea.value || "";

  apiPut("/api/admin/notes", { text })
    .then(() => {
      const notesEl = document.getElementById("admin-notes-text");
      if (notesEl) notesEl.textContent = text;
    })
    .catch(err => {
      console.error("Errore salvataggio note admin:", err);
      showNotification("Errore nel salvataggio delle note.", "error");
    });
}

// --- IMMAGINI ADMIN (LOGIN + APP) ---
function applyImagesToDOM(images) {
  const loginContainer = document.getElementById("login-images-container");
  const appContainer = document.getElementById("app-images-container");

  if (loginContainer) loginContainer.innerHTML = "";
  if (appContainer) appContainer.innerHTML = "";

  const maxImages = 12;
  for (let i = 1; i <= maxImages; i++) {
    const url = images[`image${i}URL`];
    const link = images[`image${i}Link`];
    const caption = images[`image${i}Caption`] || "";

    if (!url) continue;

    const imgEl = document.createElement("img");
    imgEl.src = url;
    imgEl.alt = caption || `Promo ${i}`;

    const linkEl = document.createElement("a");
    linkEl.href = link || "#";
    linkEl.target = link ? "_blank" : "_self";
    linkEl.appendChild(imgEl);

    if (loginContainer) {
      loginContainer.appendChild(linkEl.cloneNode(true));
    }
    if (appContainer) {
      appContainer.appendChild(linkEl);
    }
  }
}

function loadAdminImages() {
  apiGet("/api/admin/images")
    .then(images => {
      applyImagesToDOM(images);
      if (currentUser && currentUser.role === "admin") {
        const form = document.getElementById("admin-images-form");
        if (form) {
          for (let i = 1; i <= 12; i++) {
            const urlInput = form.querySelector(`#image${i}URL`);
            const linkInput = form.querySelector(`#image${i}Link`);
            const captionInput = form.querySelector(`#image${i}Caption`);

            if (urlInput) urlInput.value = images[`image${i}URL`] || "";
            if (linkInput) linkInput.value = images[`image${i}Link`] || "";
            if (captionInput) captionInput.value = images[`image${i}Caption`] || "";
          }
        }
      }
    })
    .catch(err => {
      console.error("Errore caricamento immagini admin:", err);
    });
}

function loadAppImages() {
  // qui usiamo la stessa API delle immagini admin
  loadAdminImages();
}

function saveAdminImages() {
  if (!(currentUser && currentUser.role === "admin")) {
    showNotification("Non hai i permessi per modificare le immagini.", "error");
    return;
  }

  const form = document.getElementById("admin-images-form");
  if (!form) return;

  const payload = {};
  for (let i = 1; i <= 12; i++) {
    const urlInput = form.querySelector(`#image${i}URL`);
    const linkInput = form.querySelector(`#image${i}Link`);
    const captionInput = form.querySelector(`#image${i}Caption`);

    payload[`image${i}URL`] = urlInput?.value || "";
    payload[`image${i}Link`] = linkInput?.value || "";
    payload[`image${i}Caption`] = captionInput?.value || "";
  }

  apiPut("/api/admin/images", payload)
    .then(() => {
      showNotification("Immagini aggiornate con successo.", "success");
      loadAdminImages();
    })
    .catch(err => {
      console.error("Errore salvataggio immagini admin:", err);
      showNotification("Errore nel salvataggio delle immagini.", "error");
    });
}

// --- CONFIG ADMIN (max prenotazioni) ---
function loadAdminConfig() {
  apiGet("/api/admin/config")
    .then(config => {
      lastLoadedFieldConfig = config;
      if (config && typeof config.maxBookingsPerUser === "number") {
        const maxBookingsPerUser = config.maxBookingsPerUser;
        const inputEl = document.getElementById("maxBookingsPerUser");
        if (inputEl) inputEl.value = maxBookingsPerUser;
      }
    })
    .catch(err => {
      console.error("Errore caricamento config admin:", err);
    });
}

function saveBookingParameters() {
  if (!(currentUser && currentUser.role === "admin")) {
    showNotification("Non hai i permessi per modificare i parametri.", "error");
    return;
  }
  const inputEl = document.getElementById("maxBookingsPerUser");
  if (!inputEl) return;

  const value = parseInt(inputEl.value, 10);
  if (isNaN(value) || value < 0) {
    showNotification("Valore non valido", "error");
    return;
  }

  apiPut("/api/admin/config", { maxBookingsPerUser: value })
    .then(() => {
      showNotification("Parametri di prenotazione aggiornati.", "success");
      loadAdminConfig();
    })
    .catch(err => {
      console.error("Errore salvataggio parametri prenotazione:", err);
      showNotification("Errore nel salvataggio dei parametri.", "error");
    });
}

// --- CAMPI (FIELDS) ADMIN ---
function loadFieldsConfig() {
  apiGet("/api/admin/fields")
    .then(data => {
      const fields = data.fields || [];
      const container = document.getElementById("admin-fields-container");
      if (!container) return;

      container.innerHTML = "";
      fields.forEach(f => {
        const row = document.createElement("div");
        row.className = "field-row";
        row.innerHTML = `
          <input type="text" class="field-id" value="${f.id}" placeholder="ID campo (es. BeachVolley)" />
          <input type="text" class="field-name" value="${f.name}" placeholder="Nome campo (es. Beach Volley)" />
        `;
        container.appendChild(row);
      });

      const addBtn = document.createElement("button");
      addBtn.textContent = "Aggiungi campo";
      addBtn.type = "button";
      addBtn.onclick = () => {
        const row = document.createElement("div");
        row.className = "field-row";
        row.innerHTML = `
          <input type="text" class="field-id" value="" placeholder="ID campo (es. BeachVolley)" />
          <input type="text" class="field-name" value="" placeholder="Nome campo (es. Beach Volley)" />
        `;
        container.insertBefore(row, addBtn);
      };
      container.appendChild(addBtn);

      renderFieldsForBooking(fields);
    })
    .catch(err => {
      console.error("Errore caricamento fields:", err);
    });
}

function saveFieldsConfig() {
  if (!(currentUser && currentUser.role === "admin")) {
    showNotification("Non hai i permessi per modificare i campi.", "error");
    return;
  }
  const container = document.getElementById("admin-fields-container");
  if (!container) return;

  const rows = container.querySelectorAll(".field-row");
  const fields = [];
  rows.forEach(row => {
    const idInput = row.querySelector(".field-id");
    const nameInput = row.querySelector(".field-name");
    const idVal = idInput?.value.trim();
    const nameVal = nameInput?.value.trim();
    if (idVal && nameVal) {
      fields.push({ id: idVal, name: nameVal });
    }
  });

  apiPut("/api/admin/fields", { fields })
    .then(() => {
      showNotification("Campi aggiornati correttamente.", "success");
      loadFieldsConfig();
    })
    .catch(err => {
      console.error("Errore salvataggio campi:", err);
      showNotification("Errore nel salvataggio dei campi.", "error");
    });
}

// --- RENDER FIELDS + SLOT ---
function renderFieldsForBooking(fields) {
  const container = document.getElementById("fields-container");
  if (!container) return;

  container.innerHTML = "";
  fields.forEach(field => {
    const box = document.createElement("div");
    box.className = "field-box";
    box.innerHTML = `
      <h3>${field.name}</h3>
      <div class="slot-info" id="slots-${field.id}"></div>
    `;
    container.appendChild(box);
  });

  loadReservationsForSelectedDate();
}

// --- PRENOTAZIONI (GET + RENDER) ---
function loadReservationsForSelectedDate() {
  const date = getSelectedDate();
  if (lastLoadedDate === date) {
    return;
  }
  lastLoadedDate = date;

  apiGet(`/api/reservations?date=${encodeURIComponent(date)}`)
    .then(reservations => {
      renderReservations(date, reservations || []);
    })
    .catch(err => {
      console.error("Errore caricamento prenotazioni:", err);
      showNotification("Errore nel caricamento delle prenotazioni.", "error");
    });
}

function renderReservations(date, reservations) {
  const fields = lastLoadedFieldConfig?.fields || [];
  fields.forEach(field => {
    const container = document.getElementById(`slots-${field.id}`);
    if (!container) return;
    container.innerHTML = "";

    const SLOTS = generateSlotsForDay(date);
    SLOTS.forEach(slot => {
      const reservation = reservations.find(
        r => r.field === field.id && r.date === date && r.time === slot
      );

      const div = document.createElement("div");
      div.className = "slot";
      div.textContent = slot;

      if (reservation) {
        if (reservation.role === "admin") {
          div.classList.add("admin-slot");
        } else if (currentUser && reservation.user === currentUser.username) {
          div.classList.add("mine");
        } else {
          div.classList.add("unavailable");
        }
      } else {
        div.classList.add("available");
      }

      div.addEventListener("click", () => {
        handleSlotClick(field, slot, reservation);
      });

      container.appendChild(div);
    });
  });
}

function generateSlotsForDay(date) {
  // slot di 45 minuti dalle 8:00 alle 23:00 (modifica se vuoi)
  const startHour = 8;
  const endHour = 23;
  const slotMinutes = 45;
  const slots = [];

  const base = new Date(`${date}T${String(startHour).padStart(2, "0")}:00:00`);
  const end = new Date(`${date}T${String(endHour).padStart(2, "0")}:00:00`);

  let current = new Date(base.getTime());
  while (current <= end) {
    const h = String(current.getHours()).padStart(2, "0");
    const m = String(current.getMinutes()).padStart(2, "0");
    slots.push(`${h}:${m}`);
    current = new Date(current.getTime() + slotMinutes * 60000);
  }

  return slots;
}

// --- GESTIONE SLOT (BOOK / CANCEL) ---
function handleSlotClick(field, slot, reservation) {
  if (!currentUser) {
    showNotification("Effettua il login per prenotare.", "warn");
    return;
  }

  if (reservation && reservation.user === currentUser.username) {
    cancelUserReservation(field.name, slot);
    return;
  }

  if (!reservation) {
    bookSlot(field.name, slot);
    return;
  }

  showNotification("Slot già prenotato.", "warn");
}

function bookSlot(fieldName, slot) {
  if (!currentUser) return;

  const selectedDate = getSelectedDate();
  const today        = getTodayDate();
  const now          = new Date();

  if (selectedDate < today) {
    showNotification("Non puoi prenotare per giorni passati!", "warn");
    return;
  }

  const SLOT_LENGTH_MINUTES = 45;
  if (selectedDate === today) {
    const slotStart = new Date(`${selectedDate}T${slot}:00`);
    const slotEnd   = new Date(slotStart.getTime() + SLOT_LENGTH_MINUTES * 60000);
    if (now >= slotEnd) {
      showNotification("Non puoi prenotare uno slot già terminato!", "warn");
      return;
    }
  }

  if (currentUser.role !== "admin") {
    apiGet(`/api/users/${currentUser.username}/credits`)
      .then(data => {
        const credits = data.credits ?? 0;
        if (credits <= 0) {
          showNotification("Non hai crediti sufficienti per prenotare.", "error");
          return;
        }
        internalBookSlotWithCredits(fieldName, slot);
      })
      .catch(err => {
        console.error("Errore lettura crediti per prenotazione:", err);
        showNotification("Errore nel controllo crediti.", "error");
      });
  } else {
    internalBookSlotWithCredits(fieldName, slot, true);
  }
}

function internalBookSlotWithCredits(fieldName, slot, isAdmin = false) {
  if (bookingInProgress) return;
  bookingInProgress = true;

  const selectedDate = getSelectedDate();
  const payload = {
    field: fieldName,
    date: selectedDate,
    time: slot
  };

  apiPost("/api/reservations", payload)
    .then(reservation => {
      showNotification(
        `Prenotazione effettuata per ${fieldName} alle ${slot} del ${selectedDate}.`,
        "success"
      );
      lastLoadedDate = null;
      loadReservationsForSelectedDate();
      if (!isAdmin) {
        apiPatch(`/api/users/${currentUser.username}/credits`, { delta: -1 })
          .then(() => updateUserCreditsUI())
          .catch(err => console.error("Errore aggiornamento crediti dopo prenotazione:", err));
      }
    })
    .catch(err => {
      console.error("Errore creazione prenotazione:", err);
      showNotification("Errore durante la prenotazione.", "error");
    })
    .finally(() => {
      bookingInProgress = false;
    });
}

function cancelUserReservation(fieldName, slot) {
  const selectedDate = getSelectedDate();
  const today = getTodayDate();

  if (selectedDate === today) {
    const confirmCancel = confirm(
      "Se annulli una prenotazione odierna, il credito non verrà rimborsato. Vuoi procedere?"
    );
    if (!confirmCancel) return;
  }

  deleteReservationFromServer(fieldName, selectedDate, slot, currentUser.username)
    .then(() => {
      showNotification(
        `Prenotazione annullata per ${fieldName} alle ${slot} del ${selectedDate}.`,
        "success"
      );
      lastLoadedDate = null;
      loadReservationsForSelectedDate();
      if (selectedDate > today) {
        apiPatch(`/api/users/${currentUser.username}/credits`, { delta: +1 })
          .then(() => updateUserCreditsUI())
          .catch(err => console.error("Errore nel rimborso credito:", err));
      }
    })
    .catch(() => {
      showNotification("Errore durante la cancellazione.", "error");
    });
}

function deleteReservationFromServer(fieldName, date, slot, username) {
  const fakeReservationId = `${fieldName}_${date}_${slot}_${username}`.replace(/\s+/g, "");
  return apiDelete(`/api/reservations/${encodeURIComponent(fakeReservationId)}`);
}

// --- ADMIN: GESTIONE PRENOTAZIONI LISTA ---
function loadAdminReservationsList() {
  apiGet(`/api/reservations?date=${encodeURIComponent(getSelectedDate())}`)
    .then(reservations => {
      const tbody = document.getElementById("admin-table");
      if (!tbody) return;

      tbody.innerHTML = "";
      reservations.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.field}</td>
          <td>${r.date}</td>
          <td>${r.time}</td>
          <td>${r.user}</td>
          <td>${r.role}</td>
        `;
        tbody.appendChild(tr);
      });
    })
    .catch(err => {
      console.error("Errore caricamento lista prenotazioni admin:", err);
    });
}

// --- ADMIN: RESET PRENOTAZIONI PASSATE ---
function resetPastReservations() {
  if (!(currentUser && currentUser.role === "admin")) {
    showNotification("Non hai i permessi per questa operazione.", "error");
    return;
  }
  if (!confirm("Vuoi davvero spostare le prenotazioni passate nello storico?")) return;

  apiPost("/api/reservations/reset-past", {})
    .then(data => {
      showNotification(`Spostate ${data.movedCount || 0} prenotazioni nello storico.`, "success");
      lastLoadedDate = null;
      loadReservationsForSelectedDate();
    })
    .catch(err => {
      console.error("Errore reset prenotazioni passate:", err);
      showNotification("Errore nel reset delle prenotazioni.", "error");
    });
}

// --- ADMIN: GESTIONE UTENTI (CREDENZIALI / STATO / PASSWORD) ---
async function populateCredentialsTable() {
  const tbody = document.getElementById('credentials-table');
  if (!tbody) return;

  try {
    const users = await apiGet("/api/users");
    users.sort((a, b) => {
      const getNum = (id) => {
        const lower = id.toLowerCase();
        if (lower.startsWith("ombrellone")) {
          const numStr = id.slice(10);
          const n = parseInt(numStr, 10);
          return isNaN(n) ? 999999 : n;
        } else if (lower.startsWith("user")) {
          const numStr = id.slice(4);
          const n = parseInt(numStr, 10);
          return isNaN(n) ? 999999 : n;
        } else {
          return 999999;
        }
      };
      return getNum(a.username) - getNum(b.username);
    });

    tbody.innerHTML = '';
    users.forEach(u => {
      const username = u.username;
      const password = u.password || "******";
      const isDisabled = !!u.disabled;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${username}</td>
        <td>${password}</td>
        <td>${isDisabled ? 'Disabilitato' : 'Attivo'}</td>
        <td>
          <button onclick="toggleUserStatus('${username}', ${isDisabled})">
            <i class="fas ${isDisabled ? 'fa-toggle-off' : 'fa-toggle-on'}"></i>
            ${isDisabled ? 'Attiva' : 'Dis'}
          </button>
          <button onclick="modifyUserPassword('${username}')">
            <i class="fas fa-key"></i> Mod
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error("Errore caricamento utenti:", error);
    showNotification("Errore nel caricamento degli utenti.", "error");
  }
}

function toggleUserStatus(username, currentDisabled) {
  const newStatus = !currentDisabled;

  apiPatch(`/api/users/${username}/status`, { disabled: newStatus })
    .then(() => {
      showNotification(`Stato di ${username} aggiornato a ${newStatus ? "Disabilitato" : "Attivo"}.`, "success");
      populateCredentialsTable();
    })
    .catch(error => {
      console.error("Errore nell'aggiornamento dello stato utente:", error);
      showNotification("Errore nell'aggiornamento dello stato utente.", "error");
    });
}

function modifyUserPassword(username) {
  const newPassword = prompt(`Inserisci la nuova password per ${username}:`);
  if (!newPassword) {
    showNotification("Password non modificata.", "warn");
    return;
  }

  apiPatch(`/api/users/${username}/password`, { password: newPassword })
    .then(() => {
      showNotification(`Password aggiornata per ${username}.`, "success");
      populateCredentialsTable();
    })
    .catch(error => {
      console.error("Errore nell'aggiornamento della password:", error);
      showNotification("Errore nell'aggiornamento della password.", "error");
    });
}

// --- METEO (Open-Meteo) ---
const METEO_LAT = 43.722; // Senigallia approx
const METEO_LON = 13.214;

function weatherEmoji(code) {
  if ([0].includes(code)) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if ([3].includes(code)) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55].includes(code)) return "🌦️";
  if ([56, 57].includes(code)) return "🌧️";
  if ([61, 63, 65].includes(code)) return "🌧️";
  if ([66, 67].includes(code)) return "🌧️";
  if ([71, 73, 75].includes(code)) return "❄️";
  if ([77].includes(code)) return "🌨️";
  if ([80, 81, 82].includes(code)) return "🌦️";
  if ([85, 86].includes(code)) return "🌨️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "❔";
}

function weekdayShort(dateStr){
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '');
}

async function loadDailyWeather(days=6){
  const el = document.getElementById('weather-forecast');
  if (!el) return;

  try{
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${METEO_LAT}&longitude=${METEO_LON}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`;
    const res = await fetch(url);
    if(!res.ok) throw new Error("Errore richiesta meteo");
    const data = await res.json();

    el.innerHTML = "";
    const codes = data.daily.weathercode;
    const tMax  = data.daily.temperature_2m_max;
    const tMin  = data.daily.temperature_2m_min;
    const dates = data.daily.time;

    for(let i=0; i<Math.min(days, dates.length); i++){
      const div = document.createElement("div");
      div.className = "hour-chip";

      const emoji = weatherEmoji(codes[i]);
      const wday  = weekdayShort(dates[i]);
      const max   = Math.round(tMax[i]);
      const min   = Math.round(tMin[i]);

      div.innerHTML = `
        <span class="em">${emoji}</span>
        <span class="hh">${wday.toUpperCase()} • ${max}° / ${min}°</span>
      `;
      el.appendChild(div);
    }
  }catch(e){
    console.error("Errore meteo:", e);
  }
}

// --- RESET AUTO ALLE 7:50 PER MODALITA' GIORNALIERA ---
function checkAndResetAfterSevenFifty() {
  // ora non usiamo più Firestore, quindi questa funzione può essere vuota o rimossa
  // la lasciamo come placeholder nel caso serva logica in futuro
}

// --- ADMIN: TOGGLE SEZIONI COLLASSABILI ---
function setupAdminSectionToggles(){
  document.querySelectorAll('.admin-toggle').forEach(title=>{
    const targetId = title.dataset.target;
    const target   = document.getElementById(targetId);
    if(!target) return;

    target.classList.add('hidden');
    title.style.cursor = 'pointer';
    title.addEventListener('click', ()=> target.classList.toggle('hidden'));
  });
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
  // all'avvio: utente NON loggato
  toggleSections(false);

  const today = getTodayDate();
  const datePicker = document.getElementById('booking-date');
  if (datePicker) {
    datePicker.value = today;
    datePicker.min = today;
    datePicker.addEventListener('change', () => {
      lastLoadedDate = null;
      loadReservationsForSelectedDate();
      if (currentUser && currentUser.role === "admin") {
        loadAdminReservationsList();
      }
    });
  }

  // Config admin (slot, num max prenotazioni ecc) dal server Express
  loadAdminConfig();
  loadFieldsConfig();
  setupAdminSectionToggles();

  // Immagini login e immagini interne app via API Express
  loadAdminImages();
  loadAppImages();

  // Meteo emoji
  loadDailyWeather(6);

  // Note admin
  loadAdminNotes();
});
