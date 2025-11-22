/***********************
 *  CONFIGURAZIONE FIREBASE (VERSIONE v8 COMPATIBILE)
 ***********************/
const firebaseConfig = {
  apiKey: "AIzaSyDJTMeZo6Ohf2hT9ygxhbMTCRdu5cbVhTg",
  authDomain: "ombrelloni-ddb55.firebaseapp.com",
  databaseURL: "https://ombrelloni-ddb55-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ombrelloni-ddb55",
  storageBucket: "ombrelloni-ddb55.firebasestorage.app",
  messagingSenderId: "365728121552",
  appId: "1:365728121552:web:9efa4c0cf9ddc7228814d5",
  measurementId: "G-TM9SPDQPTT"
};

// Inizializza Firebase v8 (usa gli script CDN che hai in index.html)
firebase.initializeApp(firebaseConfig);

// Firestore v8 "namespaced"
var db = firebase.firestore();

/***********************
 *  VARIABILI GLOBALI
 ***********************/
let currentUser = null;
let userCreditsListenerUnsubscribe = null;
let adminCreditsListenerUnsubscribe = null;
let userReservationsUnsubscribe = null;


// Parametri dinamici
let maxBookingsPerUser = 2; // Predefinito, si aggiorna da Firestore
let fieldsList = [];        // Lista campi, si aggiorna da Firestore

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
  if ([0].includes(code)) return "☀️";                 // sereno
  if ([1,2].includes(code)) return "🌤️";              // poco/parz. nuvoloso
  if ([3].includes(code)) return "☁️";                 // coperto
  if ([45,48].includes(code)) return "🌫️";            // nebbia
  if ([51,53,55].includes(code)) return "🌦️";         // pioviggine
  if ([56,57].includes(code)) return "🌧️";            // pioggerella gelata
  if ([61,63,65].includes(code)) return "🌧️";         // pioggia
  if ([66,67].includes(code)) return "🌧️";            // pioggia gelata
  if ([71,73,75].includes(code)) return "❄️";         // neve
  if ([77].includes(code)) return "🌨️";               // granuli di neve
  if ([80,81,82].includes(code)) return "🌦️";         // rovesci
  if ([85,86].includes(code)) return "🌨️";            // rovesci di neve
  if ([95,96,99].includes(code)) return "⛈️";          // temporale (anche con grandine)
  return "❔";
}
function weekdayShort(dateStr){
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '');
}
async function loadDailyWeather(days=6){
  const el = document.getElementById('weather-forecast'); // container nel header
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
      chip.className = 'hour-chip'; // riuso lo stile compatto già esistente
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
    // fallback minimale
    el.innerHTML = '';
    const chip = document.createElement('div');
    chip.className = 'hour-chip';
    chip.innerHTML = `<div class="em">☀️</div><div class="hh">oggi</div>`;
    el.appendChild(chip);
  }
}

/***********************
 *  LISTENER CREDITI
 ***********************/
function startUserCreditsListener() {
  if (!currentUser) return;
  if (userCreditsListenerUnsubscribe) userCreditsListenerUnsubscribe();

  userCreditsListenerUnsubscribe = db.collection("users").doc(currentUser.username)
    .onSnapshot(doc => {
      if (doc.exists) {
        const credits = doc.data().credits !== undefined ? doc.data().credits : 0;
        document.getElementById("user-credits").textContent = `Crediti: ${credits}`;
      }
    });
}
function updateUserCreditsUI() {
  if (!currentUser) return;
  db.collection("users").doc(currentUser.username).get().then(doc => {
    if (doc.exists) {
      const credits = doc.data().credits !== undefined ? doc.data().credits : 0;
      document.getElementById("user-credits").textContent = `Crediti: ${credits}`;
    }
  });
}
function startAdminCreditsListener() {
  const tbody = document.getElementById('credits-table');
  if (!tbody) return;
  if (adminCreditsListenerUnsubscribe) adminCreditsListenerUnsubscribe();

  adminCreditsListenerUnsubscribe = db.collection("users").onSnapshot(snapshot => {
    const docsArray = [];
    snapshot.forEach(doc => docsArray.push(doc));

    // Ordina per numero in "ombrelloneXX" o "userXX"
    docsArray.sort((a, b) => {
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
      return getNum(a.id) - getNum(b.id);
    });

    tbody.innerHTML = '';
    docsArray.forEach(doc => {
      const data = doc.data();
      const username = doc.id;
      const credits = data.credits !== undefined ? data.credits : 0;
      const tr = document.createElement('tr');
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
  });
}
function modifyUserCredits(username, delta) {
  const userRef = db.collection("users").doc(username);
  userRef.get().then(doc => {
    let credits = doc.data().credits !== undefined ? doc.data().credits : 0;
    let newCredits = credits + delta;
    if (newCredits < 0) newCredits = 0;
    userRef.update({ credits: newCredits })
      .then(() => showNotification(`Crediti aggiornati per ${username}: ${newCredits}`, "success"));
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
  authenticateUserFromFirestore(username, password);
}
function authenticateUserFromFirestore(username, password) {
  const userRef = db.collection("users").doc(username);

  userRef.get().then(doc => {
    if (!doc.exists) {
      showNotification("L'utente non esiste!", "error");
      return;
    }

    const userData = doc.data();

    if (userData.disabled) {
      showNotification("Questo utente è disabilitato.", "error");
      return;
    }

    if (userData.password === password) {
      if (userData.failedAttempts && userData.failedAttempts > 0) {
        userRef.update({ failedAttempts: 0 });
      }

      currentUser = { username, role: userData.role || "user" };
      toggleSections(true);
      toggleAdminSection();
      loadReservationsFromFirestore();
      checkAndResetAfterSevenFifty();
      showNotification(`Benvenuto, ${username}!`, "success");
      loadAdminNotesRealtime();
      loadAdminImagesRealtime();
      loadAppImagesRealtime();
      startUserCreditsListener();
      updateUserCreditsUI();

      if (currentUser.role === "admin") {
        startAdminCreditsListener();
      } else {
        startUserReservationsListener();
      }

      setupBuyCreditsButtons();
      return;
    }

    // Salva un pin locale (blando) – come da versione precedente
    localStorage.setItem("security_pin", "abc123");

    // Password errata: incrementa
    const attemptsSoFar = userData.failedAttempts || 0;
    const newAttempts   = attemptsSoFar + 1;
    const updatePayload = { failedAttempts: newAttempts };

    if (userData.role === "admin" && newAttempts >= MAX_FAILED_ATTEMPTS) {
      updatePayload.disabled = true;
      showNotification(
        "Tentativi esauriti: l'account è stato disabilitato. Contatta un responsabile per la riattivazione.",
        "error"
      );
    } else {
      const remaining = MAX_FAILED_ATTEMPTS - newAttempts;
      showNotification(`Credenziali errate! Tentativi rimasti: ${remaining < 0 ? 0 : remaining}`, "error");
    }

    userRef.update(updatePayload);
  }).catch(err => {
    console.error(err);
    showNotification("Errore durante il login.", "error");
  });
}
function logout() {
  if (!confirm("Vuoi davvero uscire?")) return;
  currentUser = null;
  if (userCreditsListenerUnsubscribe) userCreditsListenerUnsubscribe();
  if (adminCreditsListenerUnsubscribe) adminCreditsListenerUnsubscribe();
  if (userReservationsUnsubscribe) userReservationsUnsubscribe();

  toggleSections(false);
  showNotification("Sei uscito con successo.", "success");
}

/***********************
 *  FIRESTORE – PRENOTAZIONI
 ***********************/
function loadReservationsFromFirestore() {
  const selectedDate = getSelectedDate();
  reservations = {};

  db.collection("reservations")
    .where("date", "==", selectedDate)
    .get()
    .then(querySnapshot => {
      querySnapshot.forEach(doc => {
        const { field, time, user } = doc.data();
        if (!reservations[field]) reservations[field] = {};
        if (!reservations[field][selectedDate]) reservations[field][selectedDate] = {};
        reservations[field][selectedDate][time] = user;
      });
      populateAllFields();
      listenRealtimeForDate(selectedDate);
    })
    .catch(err => {
      console.error("Errore caricamento prenotazioni:", err);
      showNotification("Errore caricamento prenotazioni.", "error");
    });
}
function listenRealtimeForDate(selectedDate) {
  db.collection("reservations")
    .where("date", "==", selectedDate)
    .onSnapshot(snapshot => {
      reservations = {};
      snapshot.forEach(doc => {
        const { field, time, user } = doc.data();
        if (!reservations[field]) reservations[field] = {};
        if (!reservations[field][selectedDate]) reservations[field][selectedDate] = {};
        reservations[field][selectedDate][time] = user;
      });
      populateAllFields();
      populateAdminTable();
      if (currentUser && currentUser.role === "admin") {
        populateCredentialsTable();
        startAdminCreditsListener();
      }
    });
}
function saveReservationToFirestore(fieldName, date, time, user, role) {
  const docId = `${fieldName}_${date}_${time}_${user}`;
  return db.collection("reservations").doc(docId).set({ field: fieldName, date, time, user, role });
}
function deleteReservationFromFirestore(fieldName, date, time, user) {
  const docId = `${fieldName}_${date}_${time}_${user}`;
  return db.collection("reservations").doc(docId).delete();
}
async function getUserTotalReservations() {
  if (!currentUser) return 0;
  try {
    const snapshot = await db.collection("reservations")
      .where("user", "==", currentUser.username)
      .get();
    return snapshot.size;
  } catch (error) {
    console.error("Errore nel conteggio delle prenotazioni:", error);
    showNotification("Errore nel conteggio delle prenotazioni.", "error");
    return 0;
  }
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
      fieldOpenState[fieldName] = false; // di default chiusi
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

    target.classList.add('hidden'); // partono chiuse
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
    db.collection("users").doc(currentUser.username).get().then(doc => {
      let credits = doc.data().credits || 0;
      if (credits <= 0) {
        showNotification("Non hai crediti sufficienti.", "error");
        return;
      }
      getUserTotalReservations().then(total => {
        if (total >= maxBookingsPerUser) {
          showNotification(`Hai già raggiunto il numero massimo di prenotazioni (${maxBookingsPerUser}).`, "warn");
          return;
        }
        if (askBookingConfirmation(fieldName, slot, selectedDate)) {
          saveReservation(fieldName, selectedDate, slot);
        }
      }).catch(error => {
        console.error("Errore nel conteggio delle prenotazioni:", error);
        showNotification("Errore nel conteggio delle prenotazioni.", "error");
      });
    }).catch(error => {
      console.error("Errore nel controllo dei crediti:", error);
      showNotification("Errore nel controllo dei crediti.", "error");
    });
  } else {
    if (askBookingConfirmation(fieldName, slot, selectedDate)) {
      saveReservation(fieldName, selectedDate, slot);
    }
  }
}
function saveReservation(fieldName, date, slot) {
  saveReservationToFirestore(
    fieldName,
    date,
    slot,
    currentUser.username,
    (currentUser.role === "admin" ? "admin" : "user")
  )
    .then(() => {
      if (currentUser.role !== "admin") {
        db.collection("users").doc(currentUser.username).get().then(doc => {
          let currentCredits = doc.data().credits || 0;
          if (currentCredits > 0) {
            db.collection("users").doc(currentUser.username).update({
              credits: firebase.firestore.FieldValue.increment(-1)
            }).then(() => updateUserCreditsUI());
          } else {
            showNotification("Non hai crediti sufficienti. Il credito non è stato decrementato.", "warn");
            return;
          }
        });
      }
      showNotification(`Prenotazione salvata per ${fieldName} alle ${slot}`, "success");
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
    const confirmCancel = confirm("Se annulli una prenotazione odierna, il credito non verrà rimborsato. Vuoi procedere?");
    if (!confirmCancel) return;
  }

  db.collection("reservations")
    .where("user", "==", currentUser.username)
    .where("field", "==", fieldName)
    .where("time", "==", slot)
    .where("date", "==", selectedDate)
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        db.collection("reservations").doc(doc.id).delete().then(() => {
          showNotification(`Prenotazione annullata per ${fieldName} alle ${slot} del ${formatDateToDDMMYYYY(selectedDate)}`, "success");
          if (selectedDate > today && currentUser.role !== "admin") {
            db.collection("users").doc(currentUser.username).update({
              credits: firebase.firestore.FieldValue.increment(1)
            }).then(() => updateUserCreditsUI());
          }
        });
      });
    });
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
  deleteReservationFromFirestore(fieldName, date, time, user)
    .then(() => showNotification(`Prenotazione per ${fieldName} alle ${time} dell'utente ${user} eliminata.`, "success"))
    .catch(err => {
      console.error('Errore durante la cancellazione:', err);
      showNotification("Errore durante la cancellazione.", "error");
    });
}
function populateCredentialsTable() {
  const tbody = document.getElementById('credentials-table');
  if (!tbody) return;

  db.collection("users").onSnapshot(snapshot => {
    const docsArray = [];
    snapshot.forEach(doc => docsArray.push(doc));

    docsArray.sort((a, b) => {
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
      return getNum(a.id) - getNum(b.id);
    });

    tbody.innerHTML = '';
    docsArray.forEach(doc => {
      const data = doc.data();
      const username = doc.id;
      const password = data.password || "******";
      const isDisabled = data.disabled ? true : false;

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
  });
}
function toggleUserStatus(username, isDisabled) {
  const userRef = db.collection("users").doc(username);
  const newStatus = !isDisabled;
  userRef.update({ disabled: newStatus })
    .then(() => showNotification(`Stato di ${username} aggiornato a ${newStatus ? "Disabilitato" : "Attivo"}.`, "success"))
    .catch(error => {
      console.error("Errore nell'aggiornamento dello stato utente:", error);
      alert("Errore durante l'aggiornamento dello stato dell'utente.");
    });
}
function modifyUserPassword(username) {
  const newPassword = prompt(`Inserisci la nuova password per ${username}:`);
  if (!newPassword) {
    alert("Modifica annullata.");
    return;
  }
  db.collection("users").doc(username).update({ password: newPassword })
    .then(() => showNotification(`Password aggiornata per ${username}.`, "success"))
    .catch(error => {
      console.error("Errore nell'aggiornamento della password:", error);
      showNotification("Errore durante la modifica della password.", "error");
    });
}

/***********************
 *  NOTE & IMMAGINI (REALTIME)
 ***********************/
function loadAdminNotesRealtime() {
  db.collection("admin").doc("notes").onSnapshot(doc => {
    if (doc.exists) {
      const noteText = doc.data().text || "";
      document.getElementById("notes-content").textContent = noteText;
      if (currentUser && currentUser.role === "admin") {
        document.getElementById("admin-notes").value = noteText;
      }
    } else {
      db.collection("admin").doc("notes").set({ text: "" });
      document.getElementById("notes-content").textContent = "";
    }
  });
}
function saveAdminNotes() {
  if (!(currentUser && currentUser.role === "admin")) {
    showNotification("Non hai i permessi per modificare le note.", "error");
    return;
  }
  const text = document.getElementById("admin-notes").value;
  db.collection("admin").doc("notes").set({ text })
    .catch(err => {
      console.error("Errore salvataggio note:", err);
      showNotification("Errore durante il salvataggio delle note.", "error");
    });
}
function loadAppImagesRealtime() {
  const container = document.getElementById("app-images-container");
  if (!container) return;

  db.collection("admin").doc("images").onSnapshot(doc => {
    container.innerHTML = "";
    if (!doc.exists) return;

    const data = doc.data();
    for (let i = 1; i <= 8; i++) {
      const url  = data[`image${i}URL`]   || "";
      const link = data[`image${i}Link`]  || "";
      const cap  = data[`image${i}Caption`] || "";

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
  });
}
function loadAdminImagesRealtime() {
  const containerTop    = document.getElementById("login-images-container-top");
  const containerBottom = document.getElementById("login-images-container-bottom");

  db.collection("admin").doc("images").onSnapshot(doc => {
    containerTop.innerHTML    = "";
    containerBottom.innerHTML = "";

    if (doc.exists) {
      const data = doc.data();
      for (let i = 1; i <= 12; i++) {
        const url  = data[`image${i}URL`]     || "";
        const link = data[`image${i}Link`]    || "";
        const cap  = data[`image${i}Caption`] || "";

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

        (i <= 8 ? containerTop : containerBottom).appendChild(fig);

        if (currentUser && currentUser.role === "admin") {
          document.getElementById(`image${i}URL`).value     = url;
          document.getElementById(`image${i}Link`).value    = link;
          document.getElementById(`image${i}Caption`).value = cap;
        }
      }
    } else {
      const initialData = {};
      for (let i = 1; i <= 12; i++) {
        initialData[`image${i}URL`]     = "";
        initialData[`image${i}Link`]    = "";
        initialData[`image${i}Caption`] = "";
      }
      db.collection("admin").doc("images").set(initialData);
    }
  });
}
function saveAdminImages() {
  if (!(currentUser && currentUser.role === "admin")) {
    showNotification("Non hai i permessi per modificare le immagini.", "error");
    return;
  }
  const payload = {};
  for (let i = 1; i <= 12; i++) {
    payload[`image${i}URL`]     = document.getElementById(`image${i}URL`).value.trim();
    payload[`image${i}Link`]    = document.getElementById(`image${i}Link`).value.trim();
    payload[`image${i}Caption`] = document.getElementById(`image${i}Caption`).value.trim();
  }
  db.collection("admin").doc("images").set(payload, { merge:true })
    .then(() => showNotification("Immagini salvate con successo.", "success"))
    .catch(err => {
      console.error("Errore salvataggio immagini:", err);
      showNotification("Errore durante il salvataggio delle immagini.", "error");
    });
}

/***********************
 *  “LE MIE PRENOTAZIONI” (UTENTE)
 ***********************/
function startUserReservationsListener() {
  if (!currentUser) return;

  const container = document.getElementById('user-reservations');
  if (!container) return;
  container.innerHTML = '';

  // Chiudi eventuale listener precedente
  if (userReservationsUnsubscribe) {
    userReservationsUnsubscribe();
    userReservationsUnsubscribe = null;
  }

  // 👇 Solo filtro per utente (nessun indice composito richiesto)
  userReservationsUnsubscribe = db.collection("reservations")
    .where("user", "==", currentUser.username)
    .onSnapshot(
      (querySnapshot) => {
        const today = getTodayDate();
        const items = [];

        querySnapshot.forEach(doc => {
          const data = doc.data();
          if (!data || !data.date || !data.time || !data.field) return;
          // 👇 filtro lato client: solo future/oggi
          if (data.date >= today) items.push({ date: data.date, time: data.time, field: data.field });
        });

        // 👇 ordino lato client per data poi orario (stringhe ISO vanno bene)
        items.sort((a, b) => {
          const byDate = a.date.localeCompare(b.date);
          return byDate !== 0 ? byDate : a.time.localeCompare(b.time);
        });

        container.innerHTML = items.length ? '' : "<p>Nessuna prenotazione trovata.</p>";

        items.forEach(({ date, time, field }) => {
          const displayDate = formatDateToDDMMYYYY(date);
          const el = document.createElement('div');
          el.classList.add('user-reservation-item');
          el.textContent = `${displayDate} - ${time} - ${field}`;
          el.style.cursor = 'pointer';

          el.addEventListener('click', () => {
            const dp = document.getElementById('booking-date');
            if (dp) dp.value = date;
            loadReservationsFromFirestore();
            setTimeout(() => scrollToSlot(field, time), 600);
          });

          container.appendChild(el);
        });
      },
      (error) => {
        console.error("Errore realtime prenotazioni utente:", error);
        // Messaggio più utile: mostra il codice (es. 'failed-precondition' o 'permission-denied')
        showNotification(`Errore realtime prenotazioni: ${error.code || error.message}`, "error");
      }
    );
}

/***********************
 *  MOSTRA/NASCONDI SEZIONI
 ***********************/
function toggleSections(isLoggedIn) {
  document.getElementById('login-area').style.display = isLoggedIn ? 'none' : 'flex';
  document.getElementById('app-area').style.display = isLoggedIn ? 'flex' : 'none';
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
    adminSection.style.display = 'block';
    adminNotes.style.display = 'block';
    adminNotes.addEventListener('input', saveAdminNotes);
    userReservationsSection.style.display = 'none';
    if (buyCreditsSection) buyCreditsSection.style.display = 'none';
    if (userCreditsSection) userCreditsSection.style.display = 'none';
    body.classList.add('admin-visible'); // nasconde header/immagini

    // Repaint fix
    setTimeout(() => {
      document.documentElement.style.display = 'none';
      document.documentElement.offsetHeight;
      document.documentElement.style.display = '';
    }, 10);
  } else {
    adminSection.style.display = 'none';
    adminNotes.style.display = 'none';
    adminNotes.removeEventListener('input', saveAdminNotes);
    userReservationsSection.style.display = 'block';
    if (buyCreditsSection) buyCreditsSection.style.display = 'block';
    if (userCreditsSection) userCreditsSection.style.display = 'block';
    body.classList.remove('admin-visible');
  }
}

/***********************
 *  RESET AUTOMATICO
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
  const today = getTodayDate();
  db.collection("reservations")
    .get()
    .then(snapshot => {
      const batch = db.batch();
      snapshot.forEach(doc => {
        const data = doc.data();
        const reservationDate = data.date;
        if (reservationDate < today && data.role !== "admin") {
          const pastRef = db.collection("past_reservations").doc(doc.id);
          batch.set(pastRef, data);
          batch.delete(doc.ref);
        }
      });
      return batch.commit();
    })
    .then(() => {
      showNotification("Prenotazioni passate spostate nella collezione past_reservations.", "success");
      loadReservationsFromFirestore();
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

  if (isOmbrelloneSpecial(currentUser.username)) {
    buy1CreditsBtn.style.display = "none";
    buy2CreditsBtn.style.display = "none";
    buy5CreditsBtn.style.display = "none";
    specialBuyContainer.style.display = "block";

    specialBuyBtn.addEventListener("click", function() {
      if (!currentUser) { alert("Devi essere loggato per acquistare crediti!"); return; }
      localStorage.setItem("pendingUser", currentUser.username);
      localStorage.setItem("pendingCredits", "1");
      window.location.href = "https://buy.stripe.com/00waEPbnf6le1vxd8518c06";
    });
  } else {
    buy1CreditsBtn.style.display = "inline-block";
    buy2CreditsBtn.style.display = "inline-block";
    buy5CreditsBtn.style.display = "inline-block";
    specialBuyContainer.style.display = "none";

    buy1CreditsBtn.addEventListener("click", function() {
      if (!currentUser) { alert("Devi essere loggato per acquistare crediti!"); return; }
      localStorage.setItem("pendingUser", currentUser.username);
      localStorage.setItem("pendingCredits", "1");
      window.location.href = "https://buy.stripe.com/fZeaGn09h6cU2Zi003";
    });
    buy2CreditsBtn.addEventListener("click", function() {
      if (!currentUser) { alert("Devi essere loggato per acquistare crediti!"); return; }
      localStorage.setItem("pendingUser", currentUser.username);
      localStorage.setItem("pendingCredits", "2");
      window.location.href = "https://buy.stripe.com/6oEcOv09h58Q57qbIM";
    });
    buy5CreditsBtn.addEventListener("click", function() {
      if (!currentUser) { alert("Devi essere loggato per acquistare crediti!"); return; }
      localStorage.setItem("pendingUser", currentUser.username);
      localStorage.setItem("pendingCredits", "5");
      window.location.href = "https://buy.stripe.com/5kA9Cj4px8l2czS9AF";
    });
  }
}

/***********************
 *  CONFIG ADMIN & CAMPI
 ***********************/
function loadAdminConfig() {
  db.collection("admin").doc("config").onSnapshot(doc => {
    if (doc.exists) {
      const data = doc.data();
      if (data.maxBookingsPerUser !== undefined) {
        maxBookingsPerUser = data.maxBookingsPerUser;
        const inputEl = document.getElementById("maxBookingsPerUser");
        if (inputEl) inputEl.value = maxBookingsPerUser;
      }
    } else {
      db.collection("admin").doc("config").set({ maxBookingsPerUser: 2 });
    }
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

  db.collection("admin").doc("config")
    .set({ maxBookingsPerUser: newMax }, { merge: true })
    .then(() => showNotification("Parametri di prenotazione salvati con successo.", "success"))
    .catch(err => {
      console.error("Errore salvataggio parametri prenotazione:", err);
      showNotification("Errore durante il salvataggio dei parametri.", "error");
    });
}
function loadFieldsConfig() {
  db.collection("admin").doc("fields").onSnapshot(doc => {
    if (doc.exists) {
      const data = doc.data();
      if (data.fields && Array.isArray(data.fields)) {
        fieldsList = data.fields;
      } else {
        fieldsList = [];
      }
    } else {
      const defaultFields = [
        { id: "BeachVolley", name: "Beach Volley" },
        { id: "Calcio",      name: "Beach Soccer" },
        { id: "Multi",       name: "Multi-Sport" }
      ];
      db.collection("admin").doc("fields").set({ fields: defaultFields });
      fieldsList = defaultFields;
    }

    displayFieldConfigInAdmin();
    populateAllFields();
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
    fieldObj.id = idEl.value.trim();
    fieldObj.name = nameEl.value.trim();
  });

  const validFields = fieldsList.filter(f => f.id !== "" && f.name !== "");
  db.collection("admin").doc("fields").set({ fields: validFields })
    .then(() => showNotification("Configurazione campi salvata con successo.", "success"))
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
  loadAdminImagesRealtime();

  loadAdminConfig();
  loadFieldsConfig();
  setupAdminSectionToggles();

  // Meteo (emoji, 5-6 giorni)
  loadDailyWeather(6);

  const today = getTodayDate();
  const datePicker = document.getElementById('booking-date');
  if (datePicker) {
    datePicker.value = today;
    datePicker.min = today;
    datePicker.addEventListener('change', () => {
      loadReservationsFromFirestore();
    });
  }
});
