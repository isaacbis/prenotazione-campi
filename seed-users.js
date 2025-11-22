// seed-users.js
// Crea/aggiorna db.json con admin + 200 ombrelloni + alcuni ospiti/delfini

const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "db.json");

// Struttura base
let db = {
  users: {},
  reservations: [],
  pastReservations: [],
  admin: {
    notes: "",
    images: {},
    config: { maxBookingsPerUser: 2 },
    fields: [
      { id: "BeachVolley", name: "Beach Volley" },
      { id: "Calcio",      name: "Beach Soccer" },
      { id: "Multi",       name: "Multi-Sport" }
    ]
  }
};

// Se db.json esiste, lo carico e completo solo la parte utenti
if (fs.existsSync(DB_FILE)) {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    db = Object.assign(db, parsed);
    if (!db.users) db.users = {};
    if (!db.admin) db.admin = {};
    if (!db.admin.config) db.admin.config = { maxBookingsPerUser: 2 };
    if (!db.admin.fields) {
      db.admin.fields = [
        { id: "BeachVolley", name: "Beach Volley" },
        { id: "Calcio",      name: "Beach Soccer" },
        { id: "Multi",       name: "Multi-Sport" }
      ];
    }
  } catch (e) {
    console.error("Errore nel parsing di db.json, uso struttura vuota:", e);
  }
}

// Admin di default se non esiste
if (!db.users["admin"]) {
  db.users["admin"] = {
    password: "admin",      // CAMBIA A MANO DOPO!
    role: "admin",
    credits: 0,
    disabled: false,
    failedAttempts: 0
  };
}

// Crea 200 ombrelloni: username = ombrellone1..200, password = uguale allo username
for (let i = 1; i <= 200; i++) {
  const username = `ombrellone${i}`;
  if (!db.users[username]) {
    db.users[username] = {
      password: username,   // es: username=ombrellone15, password=ombrellone15
      role: "user",
      credits: 0,
      disabled: false,
      failedAttempts: 0
    };
  }
}

// Crea ospite1..5 e delfino1..5
const extraUsers = [
  "ospite1","ospite2","ospite3","ospite4","ospite5",
  "delfino1","delfino2","delfino3","delfino4","delfino5"
];

for (const u of extraUsers) {
  if (!db.users[u]) {
    db.users[u] = {
      password: u,    // password = uguale allo username
      role: "user",
      credits: 0,
      disabled: false,
      failedAttempts: 0
    };
  }
}

// SCRIVO IL FILE
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
console.log("db.json aggiornato con utenti generati.");
