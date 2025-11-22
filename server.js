// server.js
// Backend Express per app prenotazione campi SENZA Firebase, con sessioni e protezioni base

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "db.json");
const MAX_FAILED_ATTEMPTS = 3;

// Dillo a Express che è dietro un proxy (Render usa un proxy)
app.set("trust proxy", 1);

// Middleware base
app.use(cors());
app.use(express.json());

// Sessione
app.use(
  session({
    secret: process.env.SESSION_SECRET || "CAMBIA-QUESTA-FRASE-SEGRETA",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // true solo in produzione (HTTPS)
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 giorni
    },
  })
);

// Static: serve i file della tua app (index.html, script.js, style.css, success.html, immagini, ecc.)
app.use(express.static(path.join(__dirname, "public")));

/* =========================
 *  DB JSON SU FILE
 * ========================= */

let db = loadDb();

function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      const data = JSON.parse(raw);

      // Assicuro struttura minima
      if (!data.users) data.users = {};
      if (!data.reservations) data.reservations = [];
      if (!data.pastReservations) data.pastReservations = [];
      if (!data.admin) data.admin = {};
      if (!data.admin.notes) data.admin.notes = "";
      if (!data.admin.images) data.admin.images = {};
      if (!data.admin.config) data.admin.config = { maxBookingsPerUser: 2 };
      if (!data.admin.fields) {
        data.admin.fields = [
          { id: "BeachVolley", name: "Beach Volley" },
          { id: "Calcio",      name: "Beach Soccer" },
          { id: "Multi",       name: "Multi-Sport" }
        ];
      }

      return data;
    } catch (err) {
      console.error("Errore nel parsing di db.json, inizializzo nuovo DB:", err);
    }
  }

  // DB di default se non esiste ancora nulla
  return {
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
}

function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

// Helper utenti
function getUser(username) {
  if (!username) return null;
  return db.users[username] || null;
}

function setUser(username, userData) {
  db.users[username] = userData;
  saveDb();
}

// Se manca admin di default, lo creo
function ensureAdminUser() {
  if (!db.users["admin"]) {
    db.users["admin"] = {
      password: "admin",      // CAMBIALA SUBITO
      role: "admin",
      credits: 0,
      disabled: false,
      failedAttempts: 0
    };
    saveDb();
    console.log('Creato utente admin di default: "admin" / "admin" (modificalo in db.json)');
  }
}

ensureAdminUser();

function makeReservationId(field, date, time, user) {
  return `${field}_${date}_${time}_${user}`;
}

/* =========================
 *  MIDDLEWARE DI AUTENTICAZIONE
 * ========================= */

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

/* =========================
 *  ROUTE DI TEST
 * ========================= */

app.get("/api/ping", (req, res) => {
  res.json({ ok: true, message: "pong" });
});

/* =========================
 *  LOGIN, LOGOUT & UTENTI
 * ========================= */

// Login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "missing_credentials" });
  }

  const user = getUser(username);
  if (!user) {
    return res.status(404).json({ error: "user_not_found" });
  }

  if (user.disabled) {
    return res.status(403).json({ error: "user_disabled" });
  }

  if (user.password !== password) {
    user.failedAttempts = (user.failedAttempts || 0) + 1;

    if (user.role === "admin" && user.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      user.disabled = true;
    }

    saveDb();
    const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - (user.failedAttempts || 0));
    return res.status(401).json({
      error: "wrong_password",
      remaining
    });
  }

  // Password corretta
  user.failedAttempts = 0;
  saveDb();

  // Salvo utente in sessione
  req.session.user = {
    username,
    role: user.role || "user"
  };

  res.json({
    username,
    role: user.role || "user",
    credits: user.credits || 0,
    disabled: !!user.disabled
  });
});

// Logout
app.post("/api/logout", requireAuth, (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Errore distruzione sessione:", err);
      return res.status(500).json({ error: "logout_failed" });
    }
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

// Lista utenti (solo admin)
app.get("/api/users", requireAdmin, (req, res) => {
  const usersArray = Object.entries(db.users).map(([username, data]) => ({
    username,
    password: data.password || "",
    role: data.role || "user",
    credits: data.credits || 0,
    disabled: !!data.disabled
  }));
  res.json(usersArray);
});

// Dettaglio utente singolo (solo admin)
app.get("/api/users/:username", requireAdmin, (req, res) => {
  const { username } = req.params;
  const user = getUser(username);
  if (!user) {
    return res.status(404).json({ error: "user_not_found" });
  }
  res.json({
    username,
    password: user.password || "",
    role: user.role || "user",
    credits: user.credits || 0,
    disabled: !!user.disabled,
    failedAttempts: user.failedAttempts || 0
  });
});

// Crediti: GET (admin può leggere tutti, utente solo i propri)
app.get("/api/users/:username/credits", requireAuth, (req, res) => {
  const { username } = req.params;
  const sessionUser = req.session.user;

  if (sessionUser.role !== "admin" && sessionUser.username !== username) {
    return res.status(403).json({ error: "forbidden" });
  }

  const user = getUser(username);
  if (!user) {
    return res.status(404).json({ error: "user_not_found" });
  }
  res.json({ credits: user.credits || 0 });
});

// Crediti: PATCH (admin può modificare tutti, utente solo i propri)
app.patch("/api/users/:username/credits", requireAuth, (req, res) => {
  const { username } = req.params;
  const sessionUser = req.session.user;
  const { delta, set } = req.body || {};

  if (sessionUser.role !== "admin" && sessionUser.username !== username) {
    return res.status(403).json({ error: "forbidden" });
  }

  const user = getUser(username);
  if (!user) {
    return res.status(404).json({ error: "user_not_found" });
  }

  if (typeof set === "number") {
    user.credits = set;
  } else if (typeof delta === "number") {
    const current = user.credits || 0;
    user.credits = current + delta;
    if (user.credits < 0) user.credits = 0;
  } else {
    return res.status(400).json({ error: "missing_delta_or_set" });
  }

  saveDb();
  res.json({ credits: user.credits });
});

// Cambia stato abilitato/disabilitato (solo admin)
app.patch("/api/users/:username/status", requireAdmin, (req, res) => {
  const { username } = req.params;
  const { disabled } = req.body || {};

  const user = getUser(username);
  if (!user) {
    return res.status(404).json({ error: "user_not_found" });
  }

  user.disabled = !!disabled;
  saveDb();
  res.json({ username, disabled: user.disabled });
});

// Cambia password (solo admin)
app.patch("/api/users/:username/password", requireAdmin, (req, res) => {
  const { username } = req.params;
  const { password } = req.body || {};

  if (!password) {
    return res.status(400).json({ error: "missing_password" });
  }

  const user = getUser(username);
  if (!user) {
    return res.status(404).json({ error: "user_not_found" });
  }

  user.password = password;
  saveDb();
  res.json({ username, ok: true });
});

// Crea / aggiorna utente (solo admin, se ti serve)
app.put("/api/users/:username", requireAdmin, (req, res) => {
  const { username } = req.params;
  const { password, role, credits, disabled } = req.body || {};

  if (!password) {
    return res.status(400).json({ error: "missing_password" });
  }

  const existing = getUser(username) || {};
  const user = {
    password,
    role: role || existing.role || "user",
    credits: typeof credits === "number" ? credits : existing.credits || 0,
    disabled: typeof disabled === "boolean" ? disabled : !!existing.disabled,
    failedAttempts: existing.failedAttempts || 0
  };

  setUser(username, user);
  res.json({ username, ok: true });
});

/* =========================
 *  PRENOTAZIONI
 * ========================= */

// Lista prenotazioni per data (utente loggato)
app.get("/api/reservations", requireAuth, (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: "missing_date" });
  }

  const list = db.reservations.filter(r => r.date === date);
  res.json(list);
});

// Conteggio prenotazioni per utente (admin può vedere tutti, utente solo se stesso)
app.get("/api/users/:username/reservations/count", requireAuth, (req, res) => {
  const { username } = req.params;
  const sessionUser = req.session.user;

  if (sessionUser.role !== "admin" && sessionUser.username !== username) {
    return res.status(403).json({ error: "forbidden" });
  }

  const total = db.reservations.filter(r => r.user === username).length;
  res.json({ username, total });
});

// Crea prenotazione: non mi fido di "user" & "role" nel body, uso la sessione
app.post("/api/reservations", requireAuth, (req, res) => {
  const { field, date, time } = req.body || {};
  const sessionUser = req.session.user;
  const username = sessionUser.username;
  const effectiveRole = sessionUser.role || "user";

  if (!field || !date || !time) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const u = getUser(username);
  if (!u) {
    return res.status(404).json({ error: "user_not_found" });
  }
  if (u.disabled) {
    return res.status(403).json({ error: "user_disabled" });
  }

  // Controlla se slot già occupato
  const already = db.reservations.find(
    r => r.field === field && r.date === date && r.time === time
  );
  if (already) {
    return res.status(409).json({ error: "slot_already_booked" });
  }

  const id = makeReservationId(field, date, time, username);
  const record = {
    id,
    field,
    date,
    time,
    user: username,
    role: effectiveRole
  };

  db.reservations.push(record);
  saveDb();
  res.status(201).json(record);
});

// Cancella prenotazione per ID (utente può cancellare le proprie, admin tutte)
app.delete("/api/reservations/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const sessionUser = req.session.user;

  const index = db.reservations.findIndex(r => r.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "not_found" });
  }

  const reservation = db.reservations[index];

  if (sessionUser.role !== "admin" && reservation.user !== sessionUser.username) {
    return res.status(403).json({ error: "forbidden" });
  }

  db.reservations.splice(index, 1);
  saveDb();
  res.json({ deleted: reservation });
});

// Sposta prenotazioni passate in "pastReservations" (solo admin)
app.post("/api/reservations/reset-past", requireAdmin, (req, res) => {
  const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd

  const stillValid = [];
  const moved = [];

  db.reservations.forEach(r => {
    // solo prenotazioni non admin e con data < oggi
    if (r.date < today && r.role !== "admin") {
      db.pastReservations.push(r);
      moved.push(r);
    } else {
      stillValid.push(r);
    }
  });

  db.reservations = stillValid;
  saveDb();

  res.json({ movedCount: moved.length });
});

/* =========================
 *  ADMIN: NOTE, IMMAGINI, CONFIG, CAMPI
 * ========================= */

// NOTE
// GET note: pubbliche (visibili anche a login page)
app.get("/api/admin/notes", (req, res) => {
  res.json({ text: db.admin.notes || "" });
});

// PUT note: solo admin
app.put("/api/admin/notes", requireAdmin, (req, res) => {
  const { text } = req.body || {};
  db.admin.notes = text || "";
  saveDb();
  res.json({ ok: true, text: db.admin.notes });
});

// IMMAGINI (image1URL, image1Link, image1Caption, ... fino a 12)
function ensureAdminImages() {
  if (!db.admin.images) db.admin.images = {};
  for (let i = 1; i <= 12; i++) {
    if (typeof db.admin.images[`image${i}URL`] === "undefined") {
      db.admin.images[`image${i}URL`] = "";
    }
    if (typeof db.admin.images[`image${i}Link`] === "undefined") {
      db.admin.images[`image${i}Link`] = "";
    }
    if (typeof db.admin.images[`image${i}Caption`] === "undefined") {
      db.admin.images[`image${i}Caption`] = "";
    }
  }
}

// GET immagini: pubblico (per mostrarle anche nella pagina login)
app.get("/api/admin/images", (req, res) => {
  ensureAdminImages();
  res.json(db.admin.images);
});

// PUT immagini: solo admin
app.put("/api/admin/images", requireAdmin, (req, res) => {
  db.admin.images = Object.assign({}, db.admin.images, req.body || {});
  ensureAdminImages();
  saveDb();
  res.json({ ok: true, images: db.admin.images });
});

// CONFIG (maxBookingsPerUser)
// GET config: pubblico (serve alla logica di prenotazione)
app.get("/api/admin/config", (req, res) => {
  if (!db.admin.config) {
    db.admin.config = { maxBookingsPerUser: 2 };
    saveDb();
  }
  res.json(db.admin.config);
});

// PUT config: solo admin
app.put("/api/admin/config", requireAdmin, (req, res) => {
  const { maxBookingsPerUser } = req.body || {};
  if (typeof maxBookingsPerUser !== "number" || maxBookingsPerUser < 0) {
    return res.status(400).json({ error: "invalid_maxBookingsPerUser" });
  }
  db.admin.config.maxBookingsPerUser = maxBookingsPerUser;
  saveDb();
  res.json({ ok: true, config: db.admin.config });
});

// CAMPI (fields: [{ id, name }])
// GET fields: pubblico (serve a generare i box dei campi anche prima del login)
app.get("/api/admin/fields", (req, res) => {
  if (!Array.isArray(db.admin.fields)) {
    db.admin.fields = [
      { id: "BeachVolley", name: "Beach Volley" },
      { id: "Calcio",      name: "Beach Soccer" },
      { id: "Multi",       name: "Multi-Sport" }
    ];
    saveDb();
  }
  res.json({ fields: db.admin.fields });
});

// PUT fields: solo admin
app.put("/api/admin/fields", requireAdmin, (req, res) => {
  const { fields } = req.body || {};
  if (!Array.isArray(fields)) {
    return res.status(400).json({ error: "fields_must_be_array" });
  }

  db.admin.fields = fields
    .filter(f => f && typeof f.id === "string" && typeof f.name === "string")
    .map(f => ({ id: f.id.trim(), name: f.name.trim() }))
    .filter(f => f.id && f.name);

  saveDb();
  res.json({ ok: true, fields: db.admin.fields });
});

/* =========================
 *  FALLBACK SPA
 * ========================= */

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "api_not_found" });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================
 *  AVVIO SERVER
 * ========================= */

app.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});
