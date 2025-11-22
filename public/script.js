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
  return res.json();
}

/***********************
 *  VARIABILI GLOBALI
 ***********************/
let currentUser = null;

// Parametri dinamici
let maxBookingsPerUser = 2;
let fieldsList = [];        // Lista campi dal server

// Struttura prenotazioni per la data selezionata
let reservations = {};

/***********************
 *  COSTANTI DI SICUREZZA
 ***********************/
const MAX_FAILED_ATTEMPTS = 3;

/***********************
 *  UTILS DATA & UI
 ***********************/
function getTodayDate() {
  const today = new Date();
  let yyyy = today.getFullYear();
  let mm = String(today.getMonth() + 1).padStart(2, '0');
  let dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function formatDateToDDMMYYYY(isoDate) {
  if (!isoDate) return "";
  const [yyyy, mm, dd] = isoDate.split("-");
  return `${dd}/${mm}/${yyyy}`;
}
function getSelectedDate() {
  const datePicker = document.getElementById('booking-date');
  return datePicker && datePicker.value ? datePicker.value : getTodayDate();
}

/* Notifica con tipologia opzionale: "success" | "error" | "warn" | "info" */
function showNotification(message, type = "info") {
  const container = document.getElementById('notification-container');
  if (!container) return;
  const notification = document.createElement('div');
  notification.classList.add('notification');
  if (["success","error","warn"].includes(type)) notification.classList.add(type);
  notification.textContent = message;
  container.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

/***********************
 *  METEO GIORNALIERO (emoji) – Senigallia
 ***********************/
const METEO_LAT = 43.72;
const METEO_LON = 13.22;

function weatherCodeToEmoji(code){
  if ([0].includes(code)) return "☀️";
  if ([1,2].includes(code)) return "🌤️";
  if ([3].includes(code)) return "☁️";
  if ([45,48].includes(code)) return "🌫️";
  if ([51,53,55].includes(code)) return "🌦️";
  if ([56,57].includes(code)) return "🌧️";
  if ([61,63,65].includes(code)) return "🌧️";
  if ([66,67].includes(code)) return "🌧️";
  if ([71,73,75].includes(code)) return "❄️";
  if ([77].includes(code)) return "🌨️";
  if ([80,81,82].includes(code)) return "🌦️";
  if ([85,86].includes(code)) return "🌨️";
  if ([95,96,99].includes(code)) return "⛈️";
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
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${METEO_LAT}&longitude=${METEO_LON}&daily=weathercode&timezone=Europe%2FRome`;
    const res = await fetch(url);
    const data = await res.json();

    el.innerHTML = "";
    const { time, weathercode } = data.daily;

    for (let i=0; i<Math.min(days, time.length); i++){
      const day = time[i];
      const code = weathercode[i];
      const chip = document.createElement('div');
      chip.className = 'hour-chip';
      chip.title = day;

      const emEl = document.createElement('div');
      emEl.className = 'em';
      emEl.textContent = weatherCodeToEmoji(code);

      const ddEl = document.createElement('div');
      ddEl.className = 'hh';
      ddEl.textContent = weekdayShort(day);

      chip.appendChild(emEl);
      chip.appendChild(ddEl);
      el.appendChild(chip);
    }
  }catch(err){
    console.error("Meteo errore:", err);
    el.innerHTML = '';
    const chip = document.createElement('div');
    chip.className = 'hour-chip';
    chip.innerHTML = `<div class="em">☀️</div><div class="hh">oggi</div>`;
    el.appendChild(chip);
  }
}

/***********************
 *  CREDITI UTENTE & ADMIN
 ***********************/
function updateUserCreditsUI() {
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
      const username = u.username;
      const credits = u.credits ?? 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${username}</td>
        <td id="credits-${username}">${credits}</td>
        <td>
          <button onclick="modifyUserCredits('${username}', 1)">+</button>
          <button onclick="modifyUserCredits('${username}', -1)">-</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Errore caricamento utenti admin:", err);
  }
}
function modifyUserCredits(username, delta) {
  apiPatch(`/api/users/${username}/credits`, { delta })
    .then(data => {
      const td = document.getElementById(`credits-${username}`);
      if (td) td.textContent = data.credits;
      showNotification(`Crediti aggiornati per ${username}: ${data.credits}`, "success");
    })
    .catch(err => {
      console.error("Errore modifica crediti:", err);
      showNotification("Errore nella modifica dei crediti.", "error");
    });
}

/***********************
 *  LOGIN & LOGOUT
 ***********************/
function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  if (!username || !password) {
    showNotification('Inserisci username e password.', "warn");
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
      setupBuyCreditsButtons();

      if (currentUser.role === "admin") {
        startAdminCreditsListener();
        populateCredentialsTable();
      } else {
        startUserReservationsListener();
      }
    })
    .catch(err => {
      console.error("Errore login:", err);
      showNotification("Errore durante il login.", "error");
    });
}
function logout() {
  if (!confirm("Vuoi davvero uscire?")) return;
  currentUser = null;
  toggleSections(false);
  showNotification("Sei uscito con successo.", "success");
}

/***********************
 *  PRENOTAZIONI via EXPRESS
 ***********************/
function loadReservationsForSelectedDate() {
  const selectedDate = getSelectedDate();
  reservations = {};

  apiGet(`/api/reservations?date=${selectedDate}`)
    .then(list => {
      list.forEach(r => {
        const field = r.field;
        const time  = r.time;
        const user  = r.user;

        if (!reservations[field]) reservations[field] = {};
        if (!reservations[field][selectedDate]) reservations[field][selectedDate] = {};
        reservations[field][selectedDate][time] = user;
      });

      populateAllFields();
      populateAdminTable();
      if (currentUser && currentUser.role !== "admin") {
        startUserReservationsListener();
      }
    })
    .catch(err => {
      console.error("Errore caricamento prenotazioni:", err);
      showNotification("Errore caricamento prenotazioni.", "error");
    });
}

function saveReservationToServer(fieldName, date, time, user, role) {
  return apiPost("/api/reservations", {
    field: fieldName,
    date,
    time,
    user,
    role
  });
}

function deleteReservationFromServer(fieldName, date, time, user) {
  const docId = `${fieldName}_${date}_${time}_${user}`;
  return apiDelete(`/api/reservations/${encodeURIComponent(docId)}`);
}

async function getUserTotalReservations() {
  if (!currentUser) return 0;
  try {
    const data = await apiGet(`/api/users/${currentUser.username}/reservations/count`);
    return data.total || 0;
  } catch (error) {
    console.error("Errore nel conteggio delle prenotazioni:", error);
    showNotification("Errore nel conteggio delle prenotazioni.", "error");
    return 0;
  }
}

function saveReservation(fieldName, date, slot) {
  saveReservationToServer(
    fieldName,
    date,
    slot,
    currentUser.username,
    (currentUser.role === "admin" ? "admin" : "user")
  )
    .then(() => {
      if (currentUser.role !== "admin") {
        return apiPatch(`/api/users/${currentUser.username}/credits`, { delta: -1 })
          .then(() => updateUserCreditsUI());
      }
    })
    .then(() => {
      showNotification(`Prenotazione salvata per ${fieldName} alle ${slot}`, "success");
      loadReservationsForSelectedDate();
    })
    .catch(err => {
      console.error("Errore salvataggio prenotazione:", err);
      showNotification("Errore nel salvataggio della prenotazione.", "error");
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
        `Prenotazione annullata per ${fieldName} alle ${slot} del ${formatDateToDDMMYYYY(selectedDate)}`,
        "success"
      );

      if (selectedDate > today && currentUser.role !== "admin") {
        return apiPatch(`/api/users/${currentUser.username}/credits`, { delta: 1 })
          .then(() => updateUserCreditsUI());
      }
    })
    .then(() => {
      loadReservationsForSelectedDate();
    })
    .catch(err => {
      console.error("Errore annullamento prenotazione:", err);
      showNotification("Errore nell'annullamento della prenotazione.", "error");
    });
}

/***********************
 *  UI CAMPI E SLOT
 ***********************/
const TIME_SLOTS = [
  "08:45","09:30","10:15",
  "11:00","11:45","12:30","13:15",
  "14:00","14:45","15:30","16:15",
  "17:00","17:45","18:30","19:15"
];
const SLOT_LEN = 45;

function populateAllFields() {
  createFieldBoxesDynamically();
  fieldsList.forEach(fieldObj => populateFieldSlots(fieldObj.id));
  setupFieldClickToggles();
}
function createFieldBoxesDynamically() {
  const mainContainer = document.getElementById("fields-container");
  if (!mainContainer) return;

  mainContainer.innerHTML = "";
  fieldsList.forEach(fieldObj => {
    const box = document.createElement("div");
    box.classList.add("field-box");
    box.id = `field-${fieldObj.id}`;

    const title = document.createElement("h3");
    title.textContent = fieldObj.name;
    box.appendChild(title);

    const slotDiv = document.createElement("div");
    slotDiv.classList.add("slot-info");
    slotDiv.id = `slots-${fieldObj.id}`;
    box.appendChild(slotDiv);

    mainContainer.appendChild(box);
  });
}
function getSlotIntervalLabel(startTime) {
  const idx = TIME_SLOTS.indexOf(startTime);
  if (idx !== -1 && idx < TIME_SLOTS.length - 1) {
    return `${startTime} - ${TIME_SLOTS[idx + 1]}`;
  }
  const [h, m] = startTime.split(":").map(Number);
  const end = new Date(0, 0, 0, h, m + SLOT_LEN);
  return `${startTime} - ${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
}
function askBookingConfirmation(fieldName, slot, isoDate) {
  const intervalLabel = getSlotIntervalLabel(slot);
  const displayDate   = formatDateToDDMMYYYY(isoDate);
  const msg = `Confermi la prenotazione per il campo “${fieldName}”\n` +
              `il ${displayDate} – ${intervalLabel}?`;
  return confirm(msg);
}
function populateFieldSlots(fieldName) {
  const selectedDate = getSelectedDate();
  const container = document.getElementById(`slots-${fieldName}`);
  if (!container) return;

  if (!reservations[fieldName]) reservations[fieldName] = {};
  if (!reservations[fieldName][selectedDate]) reservations[fieldName][selectedDate] = {};
  container.innerHTML = '';

  TIME_SLOTS.forEach(slot => {
    const slotDiv = document.createElement('div');
    slotDiv.id = `slot-${fieldName}-${slot.replace(":", "")}`;
    slotDiv.classList.add('slot');

    const intervalLabel = getSlotIntervalLabel(slot);
    const bookedBy = reservations[fieldName][selectedDate][slot];

    if (bookedBy) {
      if (currentUser && bookedBy === currentUser.username) {
        slotDiv.classList.add('my-booking');
        slotDiv.textContent = `${intervalLabel} - Prenotato da Te`;
        slotDiv.onclick = () => cancelUserReservation(fieldName, slot);
      } else if (currentUser && currentUser.role === "admin") {
        slotDiv.classList.add('unavailable');
        slotDiv.textContent = `${intervalLabel} - Prenotato da ${bookedBy}`;
      } else {
        slotDiv.classList.add('unavailable');
        slotDiv.textContent = `${intervalLabel} - Prenotato`;
      }
    } else {
      slotDiv.classList.add('available');
      slotDiv.textContent = `${intervalLabel} - Disponibile`;
      slotDiv.onclick = () => bookSlot(fieldName, slot);
    }

    container.appendChild(slotDiv);
  });
}
function scrollToSlot(fieldName, slot) {
  fieldOpenState[fieldName] = true;
  const slotContainer = document.getElementById(`slots-${fieldName}`);
  if (slotContainer) slotContainer.classList.remove('hidden');
  const slotId = `slot-${fieldName}-${slot.replace(":", "")}`;
  const slotEl = document.getElementById(slotId);
  if (slotEl) slotEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/***********************
 *  TOGGLE CAMPI & ADMIN
 ***********************/
let fieldOpenState = {};
function setupFieldClickToggles(){
  fieldsList.forEach(fieldObj=>{
    const fieldName = fieldObj.id;

    if(fieldOpenState[fieldName]===undefined){
      fieldOpenState[fieldName] = false;
    }

    const fieldContainer = document.getElementById(`field-${fieldName}`);
    const slotContainer  = document.getElementById(`slots-${fieldName}`);
    if(!fieldContainer||!slotContainer) return;

    slotContainer.classList.toggle('hidden', !fieldOpenState[fieldName]);

    const title = fieldContainer.querySelector('h3');
    if(title){
      title.style.cursor='pointer';
      title.addEventListener('click',()=>{
        fieldOpenState[fieldName]=!fieldOpenState[fieldName];
        slotContainer.classList.toggle('hidden');
      });
    }
  });
}
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

/***********************
 *  BOOK / CANCEL
 ***********************/
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
          showNotification("Non hai crediti sufficienti.", "error");
          return;
        }
        return getUserTotalReservations().then(total => {
          if (total >= maxBookingsPerUser) {
            showNotification(`Hai già raggiunto il numero massimo di prenotazioni (${maxBookingsPerUser}).`, "warn");
            return;
          }
          if (askBookingConfirmation(fieldName, slot, selectedDate)) {
            saveReservation(fieldName, selectedDate, slot);
          }
        });
      })
      .catch(error => {
        console.error("Errore nel controllo dei crediti:", error);
        showNotification("Errore nel controllo dei crediti.", "error");
      });
  } else {
    if (askBookingConfirmation(fieldName, slot, selectedDate)) {
      saveReservation(fieldName, selectedDate, slot);
    }
  }
}

/***********************
 *  ADMIN – TABELLE, NOTE, UTENTI
 ***********************/
function populateAdminTable() {
  const selectedDate = getSelectedDate();
  const displayedDate = formatDateToDDMMYYYY(selectedDate);
  const tbody = document.getElementById('admin-table');
  if (!tbody) return;
  tbody.innerHTML = '';

  for (let field in reservations) {
    if (reservations[field][selectedDate]) {
      for (let time in reservations[field][selectedDate]) {
        const user = reservations[field][selectedDate][time];
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${field}</td>
          <td>${displayedDate}</td>
          <td>${time}</td>
          <td>${user}</td>
          <td>
            <button class="cancel-btn" onclick="deleteAdminReservation('${field}','${selectedDate}','${time}','${user}')">
              <i class="fas fa-trash-alt"></i> C
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      }
    }
  }
}
function deleteAdminReservation(fieldName, date, time, user) {
  deleteReservationFromServer(fieldName, date, time, user)
    .then(() => {
      showNotification(`Prenotazione per ${fieldName} alle ${time} dell'utente ${user} eliminata.`, "success");
      loadReservationsForSelectedDate();
    })
    .catch(err => {
      console.error('Errore durante la cancellazione:', err);
      showNotification("Errore durante la cancellazione.", "error");
    });
}
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
  } catch (err) {
    console.error("Errore caricamento utenti admin:", err);
  }
}
function toggleUserStatus(username, isDisabled) {
  const newStatus = !isDisabled;
  apiPatch(`/api/users/${username}/status`, { disabled: newStatus })
    .then(() => {
      showNotification(`Stato di ${username} aggiornato a ${newStatus ? "Disabilitato" : "Attivo"}.`, "success");
      populateCredentialsTable();
    })
    .catch(error => {
      console.error("Errore nell'aggiornamento dello stato utente:", error);
      showNotification("Errore durante l'aggiornamento dello stato dell'utente.", "error");
    });
}
function modifyUserPassword(username) {
  const newPassword = prompt(`Inserisci la nuova password per ${username}:`);
  if (!newPassword) {
    alert("Modifica annullata.");
    return;
  }
  apiPatch(`/api/users/${username}/password`, { password: newPassword })
    .then(() => {
      showNotification(`Password aggiornata per ${username}.`, "success");
      populateCredentialsTable();
    })
    .catch(error => {
      console.error("Errore nell'aggiornamento della password:", error);
      showNotification("Errore durante la modifica della password.", "error");
    });
}

/***********************
 *  NOTE & IMMAGINI via EXPRESS
 ***********************/
function loadAdminNotes() {
  apiGet("/api/admin/notes")
    .then(data => {
      const noteText = data.text || "";
      const notesContent = document.getElementById("notes-content");
      const adminNotes = document.getElementById("admin-notes");
      if (notesContent) notesContent.textContent = noteText;
      if (adminNotes && currentUser && currentUser.role === "admin") {
        adminNotes.value = noteText;
      }
    })
    .catch(err => {
      console.error("Errore caricamento note admin:", err);
    });
}
function saveAdminNotes() {
  if (!(currentUser && currentUser.role === "admin")) {
    showNotification("Non hai i permessi per modificare le note.", "error");
    return;
  }
  const text = document.getElementById("admin-notes").value;
  apiPut("/api/admin/notes", { text })
    .then(() => showNotification("Note salvate con successo.", "success"))
    .catch(err => {
      console.error("Errore salvataggio note:", err);
      showNotification("Errore durante il salvataggio delle note.", "error");
    });
}
function renderAppImages(imagesData) {
  const container = document.getElementById("app-images-container");
  if (!container) return;
  container.innerHTML = "";

  for (let i = 1; i <= 8; i++) {
    const url  = imagesData[`image${i}URL`]   || "";
    const link = imagesData[`image${i}Link`]  || "";
    const cap  = imagesData[`image${i}Caption`] || "";

    if (!url) continue;

    const fig = document.createElement("figure");
    fig.classList.add("img-caption");

    const a = document.createElement("a");
    a.href   = link || "#";
    a.target = "_blank";

    const img = document.createElement("img");
    img.src = url;
    img.alt = `Immagine ${i}`;

    a.appendChild(img);
    fig.appendChild(a);

    if (cap) {
      const fc = document.createElement("figcaption");
      fc.textContent = cap;
      fig.appendChild(fc);
    }

    container.appendChild(fig);
  }
}
function loadAppImages() {
  apiGet("/api/admin/images")
    .then(images => {
      renderAppImages(images);
    })
    .catch(err => {
      console.error("Errore caricamento immagini app:", err);
    });
}
function loadAdminImages() {
  const containerTop    = document.getElementById("login-images-container-top");
  const containerBottom = document.getElementById("login-images-container-bottom");

  apiGet("/api/admin/images")
    .then(images => {
      if (containerTop) containerTop.innerHTML = "";
      if (containerBottom) containerBottom.innerHTML = "";

      for (let i = 1; i <= 12; i++) {
        const url  = images[`image${i}URL`]     || "";
        const link = images[`image${i}Link`]    || "";
        const cap  = images[`image${i}Caption`] || "";

        if (!url) continue;

        const fig = document.createElement("figure");
        fig.classList.add("img-caption");

        const a   = document.createElement("a");
        a.href    = link || "#";
        a.target  = "_blank";

        const img = document.createElement("img");
        img.src   = url;
        img.alt   = `Immagine ${i}`;

        a.appendChild(img);
        fig.appendChild(a);

        if (cap) {
          const fc = document.createElement("figcaption");
          fc.textContent = cap;
          fig.appendChild(fc);
        }

        if (containerTop && i <= 8) containerTop.appendChild(fig);
        else if (containerBottom && i > 8) containerBottom.appendChild(fig);

        if (currentUser && currentUser.role === "admin") {
          const urlInput  = document.getElementById(`image${i}URL`);
          const linkInput = document.getElementById(`image${i}Link`);
          const capInput  = document.getElementById(`image${i}Caption`);
          if (urlInput)  urlInput.value  = url;
          if (linkInput) linkInput.value = link;
          if (capInput)  capInput.value  = cap;
        }
      }
    })
    .catch(err => {
      console.error("Errore caricamento immagini login:", err);
    });
}
function saveAdminImages() {
  if (!(currentUser && currentUser.role === "admin")) {
    showNotification("Non hai i permessi per modificare le immagini.", "error");
    return;
  }
  const payload = {};
  for (let i = 1; i <= 12; i++) {
    const urlInput  = document.getElementById(`image${i}URL`);
    const linkInput = document.getElementById(`image${i}Link`);
    const capInput  = document.getElementById(`image${i}Caption`);
    payload[`image${i}URL`]     = urlInput  ? urlInput.value.trim()  : "";
    payload[`image${i}Link`]    = linkInput ? linkInput.value.trim() : "";
    payload[`image${i}Caption`] = capInput  ? capInput.value.trim()  : "";
  }
  apiPut("/api/admin/images", payload)
    .then(() => {
      showNotification("Immagini salvate con successo.", "success");
      loadAdminImages();
      loadAppImages();
    })
    .catch(err => {
      console.error("Errore salvataggio immagini:", err);
      showNotification("Errore durante il salvataggio delle immagini.", "error");
    });
}

/***********************
 *  “LE MIE PRENOTAZIONI” (UTENTE)
 *  (versione semplificata: mostra solo la data selezionata)
 ***********************/
function startUserReservationsListener() {
  if (!currentUser) return;

  const container = document.getElementById('user-reservations');
  const section = document.getElementById('user-reservations-section');
  if (!container || !section) return;

  const selectedDate = getSelectedDate();
  container.innerHTML = '';

  const fieldNames = Object.keys(reservations || {});
  const items = [];

  fieldNames.forEach(field => {
    const dayObj = reservations[field] && reservations[field][selectedDate];
    if (!dayObj) return;
    Object.keys(dayObj).forEach(time => {
      const user = dayObj[time];
      if (user === currentUser.username) {
        items.push({ date: selectedDate, time, field });
      }
    });
  });

  items.sort((a, b) => a.time.localeCompare(b.time));

  if (!items.length) {
    container.innerHTML = "<p>Nessuna prenotazione trovata per la data selezionata.</p>";
    return;
  }

  items.forEach(({ date, time, field }) => {
    const displayDate = formatDateToDDMMYYYY(date);
    const el = document.createElement('div');
    el.classList.add('user-reservation-item');
    el.textContent = `${displayDate} - ${time} - ${field}`;
    el.style.cursor = 'pointer';

    el.addEventListener('click', () => {
      const dp = document.getElementById('booking-date');
      if (dp) dp.value = date;
      loadReservationsForSelectedDate();
      setTimeout(() => scrollToSlot(field, time), 600);
    });

    container.appendChild(el);
  });
}

/***********************
 *  MOSTRA/NASCONDI SEZIONI
 ***********************/
function toggleSections(isLoggedIn) {
  const loginArea = document.getElementById('login-area');
  const appArea = document.getElementById('app-area');
  if (loginArea) loginArea.style.display = isLoggedIn ? 'none' : 'flex';
  if (appArea) appArea.style.display = isLoggedIn ? 'flex' : 'none';
  if (isLoggedIn) window.scrollTo(0, 0);
}
function toggleAdminSection() {
  const adminSection = document.getElementById('admin-area');
  const adminNotes = document.getElementById('admin-notes');
  const userReservationsSection = document.getElementById('user-reservations-section');
  const buyCreditsSection = document.getElementById('buy-credits-section');
  const userCreditsSection = document.getElementById('user-credits-section');
  const body = document.body;

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

/***********************
 *  RESET AUTOMATICO (usa Express)
 ***********************/
function checkAndResetAfterSevenFifty() {
  const lastResetDate = localStorage.getItem('lastResetDate');
  const today = getTodayDate();
  const now = new Date();
  if (lastResetDate !== today) {
    if (now.getHours() > 7 || (now.getHours() === 7 && now.getMinutes() >= 50)) {
      resetAllReservations();
      localStorage.setItem('lastResetDate', today);
    }
  }
}
function resetAllReservations() {
  apiPost("/api/reservations/reset-past", {})
    .then(res => {
      showNotification("Prenotazioni passate spostate nell'archivio.", "success");
      loadReservationsForSelectedDate();
    })
    .catch(err => {
      console.error("Errore durante il reset delle prenotazioni:", err);
      showNotification("Errore durante il reset delle prenotazioni.", "error");
    });
}

/***********************
 *  ACQUISTO CREDITI – STRIPE
 ***********************/
function isOmbrelloneSpecial(username) {
  const specialOmbrelloni = ["ospite1","ospite2","ospite3","ospite4","ospite5","delfino1","delfino2","delfino3","delfino4","delfino5"];
  return specialOmbrelloni.includes(username.toLowerCase());
}
function setupBuyCreditsButtons() {
  if (!currentUser) return;

  const buy1CreditsBtn = document.getElementById("buy-credits-1");
  const buy2CreditsBtn = document.getElementById("buy-credits-2");
  const buy5CreditsBtn = document.getElementById("buy-credits-5");

  const specialBuyContainer = document.getElementById("special-buy-container");
  const specialBuyBtn = document.getElementById("buy-special");

  function preparePurchase(button, credits, url) {
    if (!button) return;
    button.onclick = () => {
      if (!currentUser) {
        alert("Devi essere loggato per acquistare crediti!");
        return;
      }
      localStorage.setItem("pendingUser", currentUser.username);
      localStorage.setItem("pendingCredits", String(credits));
      window.location.href = url;
    };
  }

  if (isOmbrelloneSpecial(currentUser.username)) {
    if (buy1CreditsBtn) buy1CreditsBtn.style.display = "none";
    if (buy2CreditsBtn) buy2CreditsBtn.style.display = "none";
    if (buy5CreditsBtn) buy5CreditsBtn.style.display = "none";
    if (specialBuyContainer) specialBuyContainer.style.display = "block";

    preparePurchase(specialBuyBtn, 1, "https://buy.stripe.com/00waEPbnf6le1vxd8518c06");
  } else {
    if (buy1CreditsBtn) buy1CreditsBtn.style.display = "inline-block";
    if (buy2CreditsBtn) buy2CreditsBtn.style.display = "inline-block";
    if (buy5CreditsBtn) buy5CreditsBtn.style.display = "inline-block";
    if (specialBuyContainer) specialBuyContainer.style.display = "none";

    preparePurchase(buy1CreditsBtn, 1, "https://buy.stripe.com/fZeaGn09h6cU2Zi003");
    preparePurchase(buy2CreditsBtn, 2, "https://buy.stripe.com/6oEcOv09h58Q57qbIM");
    preparePurchase(buy5CreditsBtn, 5, "https://buy.stripe.com/5kA9Cj4px8l2czS9AF");
  }
}

/***********************
 *  CONFIG ADMIN & CAMPI via EXPRESS
 ***********************/
function loadAdminConfig() {
  apiGet("/api/admin/config")
    .then(config => {
      if (config.maxBookingsPerUser !== undefined) {
        maxBookingsPerUser = config.maxBookingsPerUser;
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

  const newMax = parseInt(inputEl.value);
  if (isNaN(newMax) || newMax < 1) {
    showNotification("Valore non valido.", "warn");
    return;
  }

  apiPut("/api/admin/config", { maxBookingsPerUser: newMax })
    .then(() => showNotification("Parametri di prenotazione salvati con successo.", "success"))
    .catch(err => {
      console.error("Errore salvataggio parametri prenotazione:", err);
      showNotification("Errore durante il salvataggio dei parametri.", "error");
    });
}
function loadFieldsConfig() {
  apiGet("/api/admin/fields")
    .then(data => {
      if (data.fields && Array.isArray(data.fields)) {
        fieldsList = data.fields;
      } else {
        fieldsList = [];
      }
      displayFieldConfigInAdmin();
      populateAllFields();
    })
    .catch(err => {
      console.error("Errore caricamento campi:", err);
    });
}
function displayFieldConfigInAdmin() {
  const container = document.getElementById("field-config-container");
  if (!container) return;
  container.innerHTML = "";

  fieldsList.forEach((fieldObj, index) => {
    const rowDiv = document.createElement("div");
    rowDiv.style.marginBottom = "6px";
    rowDiv.innerHTML = `
      <input type="text" placeholder="ID campo" value="${fieldObj.id}" id="fieldId-${index}" style="width: 120px;">
      <input type="text" placeholder="Nome visualizzato" value="${fieldObj.name}" id="fieldName-${index}" style="width: 180px;">
      <button onclick="removeFieldRow(${index})">Rimuovi</button>
    `;
    container.appendChild(rowDiv);
  });
}
function addFieldRow() {
  fieldsList.push({ id: "", name: "" });
  displayFieldConfigInAdmin();
}
function removeFieldRow(index) {
  fieldsList.splice(index, 1);
  displayFieldConfigInAdmin();
}
function saveFieldConfig() {
  if (!(currentUser && currentUser.role === "admin")) {
    showNotification("Non hai i permessi per modificare i campi.", "error");
    return;
  }

  const container = document.getElementById("field-config-container");
  if (!container) return;

  fieldsList.forEach((fieldObj, index) => {
    const idEl = document.getElementById(`fieldId-${index}`);
    const nameEl = document.getElementById(`fieldName-${index}`);
    fieldObj.id = idEl ? idEl.value.trim() : "";
    fieldObj.name = nameEl ? nameEl.value.trim() : "";
  });

  const validFields = fieldsList.filter(f => f.id !== "" && f.name !== "");
  apiPut("/api/admin/fields", { fields: validFields })
    .then(() => {
      showNotification("Configurazione campi salvata con successo.", "success");
      loadFieldsConfig();
    })
    .catch(err => {
      console.error("Errore salvataggio campi:", err);
      showNotification("Errore durante il salvataggio dei campi.", "error");
    });
}

/***********************
 *  INIT
 ***********************/
document.addEventListener('DOMContentLoaded', () => {
  toggleSections(false);

  loadAdminImages();
  loadAppImages();
  loadAdminConfig();
  loadFieldsConfig();
  loadAdminNotes();
  setupAdminSectionToggles();

  loadDailyWeather(6);

  const today = getTodayDate();
  const datePicker = document.getElementById('booking-date');
  if (datePicker) {
    datePicker.value = today;
    datePicker.min = today;
    datePicker.addEventListener('change', () => {
      loadReservationsForSelectedDate();
    });
  }
});
