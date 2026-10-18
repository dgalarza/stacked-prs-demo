/* global document, fetch, window */

/**
 * Notes frontend. Plain JavaScript, no build step. Two states: signed out
 * (auth panel) and signed in (notes panel). On load it asks `/api/me` which
 * applies, then renders. Every API call goes through `api()` so cookies, JSON
 * and error shapes are handled once.
 */

(function () {
  "use strict";

  var $ = function (id) {
    return document.getElementById(id);
  };

  var els = {
    nav: $("nav"),
    error: $("error"),
    authPanel: $("auth-panel"),
    authForm: $("auth-form"),
    authSubmit: $("auth-submit"),
    tabLogin: $("tab-login"),
    tabRegister: $("tab-register"),
    passwordHint: $("password-hint"),
    notesPanel: $("notes-panel"),
    noteForm: $("note-form"),
    notesList: $("notes-list"),
    notesEmpty: $("notes-empty"),
    noteCount: $("note-count"),
    noteTemplate: $("note-template"),
    loadingPanel: $("loading-panel"),
  };

  var state = { user: null, notes: [], authMode: "login", busy: false };

  // -- API client ---------------------------------------------------------

  /** Resolves with the parsed body on 2xx; rejects with an Error carrying status, code and details otherwise. */
  function api(method, path, body) {
    var init = { method: method, headers: { accept: "application/json" }, credentials: "same-origin" };
    if (body !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return fetch(path, init).then(function (res) {
      if (res.status === 204) return null;
      return res.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (e) {
          data = { error: text };
        }
        if (res.ok) return data;
        var err = new Error((data && data.error) || "request failed (" + res.status + ")");
        err.status = res.status;
        err.code = data && data.code;
        err.details = (data && data.details) || {};
        throw err;
      });
    });
  }

  // -- Rendering ----------------------------------------------------------

  function setBusy(busy) {
    state.busy = busy;
    var buttons = document.querySelectorAll("button[type=submit]");
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = busy;
  }

  function showError(message) {
    els.error.textContent = message;
    els.error.hidden = false;
  }

  function clearError() {
    els.error.textContent = "";
    els.error.hidden = true;
  }

  /** Writes per-field errors from an API `details` map under the inputs. */
  function showFieldErrors(form, details) {
    var slots = form.querySelectorAll("[data-error-for]");
    for (var i = 0; i < slots.length; i++) {
      slots[i].textContent = details[slots[i].getAttribute("data-error-for")] || "";
    }
  }

  /** Shows field errors when the server named fields, otherwise the banner. */
  function showRequestError(form, err) {
    if (err.details && Object.keys(err.details).length > 0) showFieldErrors(form, err.details);
    else showError(err.message);
  }

  function formatTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function renderNav() {
    els.nav.textContent = "";
    if (!state.user) return;
    var email = document.createElement("span");
    email.className = "topbar__user";
    email.textContent = state.user.email;
    var signOut = document.createElement("button");
    signOut.className = "button button--ghost";
    signOut.type = "button";
    signOut.textContent = "Sign out";
    signOut.addEventListener("click", onSignOut);
    els.nav.appendChild(email);
    els.nav.appendChild(signOut);
  }

  function renderAuthMode() {
    var isLogin = state.authMode === "login";
    els.tabLogin.classList.toggle("is-active", isLogin);
    els.tabRegister.classList.toggle("is-active", !isLogin);
    els.tabLogin.setAttribute("aria-selected", String(isLogin));
    els.tabRegister.setAttribute("aria-selected", String(!isLogin));
    els.authSubmit.textContent = isLogin ? "Sign in" : "Create account";
    els.passwordHint.hidden = isLogin;
    els.authForm.password.autocomplete = isLogin ? "current-password" : "new-password";
    showFieldErrors(els.authForm, {});
  }

  function renderNote(note) {
    var fragment = els.noteTemplate.content.cloneNode(true);
    fragment.querySelector(".note").dataset.id = note.id;
    fragment.querySelector(".note__title").textContent = note.title;
    var body = fragment.querySelector(".note__body");
    if (note.body) body.textContent = note.body;
    else body.remove();
    var time = fragment.querySelector(".note__time");
    time.dateTime = note.createdAt;
    time.textContent = formatTime(note.createdAt);
    fragment.querySelector(".note__delete").addEventListener("click", function () {
      onDeleteNote(note.id);
    });
    return fragment;
  }

  function renderNotes() {
    els.notesList.textContent = "";
    var count = state.notes.length;
    els.noteCount.textContent = count === 1 ? "1 note" : count + " notes";
    els.notesEmpty.hidden = count > 0;
    // Newest first in the UI; the API returns oldest first.
    for (var i = count - 1; i >= 0; i--) els.notesList.appendChild(renderNote(state.notes[i]));
  }

  function render() {
    els.loadingPanel.hidden = true;
    renderNav();
    els.authPanel.hidden = !!state.user;
    els.notesPanel.hidden = !state.user;
    if (state.user) renderNotes();
    else renderAuthMode();
  }

  // -- Actions ------------------------------------------------------------

  function loadNotes() {
    return api("GET", "/api/notes").then(function (data) {
      state.notes = data.notes;
    });
  }

  function loadSession() {
    return api("GET", "/api/me")
      .then(function (data) {
        state.user = data.user;
        return loadNotes();
      })
      .catch(function (err) {
        if (err.status !== 401) throw err;
        state.user = null;
        state.notes = [];
      });
  }

  /** Session expired or was revoked elsewhere. Return to the auth panel. */
  function handleSignedOut() {
    state.user = null;
    state.notes = [];
    state.authMode = "login";
    render();
  }

  function onAuthSubmit(event) {
    event.preventDefault();
    if (state.busy) return;
    clearError();
    showFieldErrors(els.authForm, {});
    var path = state.authMode === "login" ? "/api/login" : "/api/register";
    setBusy(true);
    api("POST", path, { email: els.authForm.email.value.trim(), password: els.authForm.password.value })
      .then(function (data) {
        state.user = data.user;
        els.authForm.reset();
        return loadNotes();
      })
      .then(render)
      .catch(function (err) {
        showRequestError(els.authForm, err);
      })
      .then(function () {
        setBusy(false);
      });
  }

  function onNoteSubmit(event) {
    event.preventDefault();
    if (state.busy) return;
    clearError();
    showFieldErrors(els.noteForm, {});
    var payload = { title: els.noteForm.title.value.trim() };
    if (els.noteForm.body.value.length > 0) payload.body = els.noteForm.body.value;
    setBusy(true);
    api("POST", "/api/notes", payload)
      .then(function (data) {
        state.notes.push(data.note);
        els.noteForm.reset();
        els.noteForm.title.focus();
        renderNotes();
      })
      .catch(function (err) {
        if (err.status === 401) return handleSignedOut();
        showRequestError(els.noteForm, err);
      })
      .then(function () {
        setBusy(false);
      });
  }

  function onDeleteNote(id) {
    if (state.busy) return;
    clearError();
    // Optimistic removal; put it back if the server disagrees.
    var index = state.notes.findIndex(function (n) {
      return n.id === id;
    });
    if (index === -1) return;
    var removed = state.notes.splice(index, 1)[0];
    renderNotes();
    api("DELETE", "/api/notes/" + encodeURIComponent(id)).catch(function (err) {
      if (err.status === 401) return handleSignedOut();
      if (err.status === 404) return;
      state.notes.splice(index, 0, removed);
      renderNotes();
      showError(err.message);
    });
  }

  function onSignOut() {
    if (state.busy) return;
    clearError();
    setBusy(true);
    api("POST", "/api/logout")
      .catch(function () {
        // A failed logout still means we drop local state.
      })
      .then(function () {
        setBusy(false);
        handleSignedOut();
      });
  }

  function onTabClick(event) {
    var mode = event.currentTarget.getAttribute("data-mode");
    if (mode === state.authMode) return;
    state.authMode = mode;
    clearError();
    renderAuthMode();
    els.authForm.email.focus();
  }

  // -- Boot ---------------------------------------------------------------

  function boot() {
    els.authForm.addEventListener("submit", onAuthSubmit);
    els.noteForm.addEventListener("submit", onNoteSubmit);
    els.tabLogin.addEventListener("click", onTabClick);
    els.tabRegister.addEventListener("click", onTabClick);
    loadSession()
      .then(render)
      .catch(function (err) {
        els.loadingPanel.hidden = true;
        showError("Could not reach the server: " + err.message);
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  // Exposed for debugging in the console. Not part of any contract.
  window.__notesApp = { state: state, api: api };
})();
