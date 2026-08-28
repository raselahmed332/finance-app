// ============================================================
// PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE
// (You get this after deploying backend/Code.gs as a Web App —
//  see the "Deploy the backend" step in the hosting guide.)
// It looks like:
// https://script.google.com/macros/s/AKfycb..................../exec
// ============================================================
const API_URL =
  "https://script.google.com/macros/s/AKfycbzRueKFcJCUDVrjXSvulYh5wjzJEi0JsbRIADhC_cqZdO4MTxUCmfrtrrfiRAEzDCuh/exec";

async function callApi(action, params = []) {
  const res = await fetch(API_URL, {
    method: "POST",
    // Using text/plain avoids a CORS "preflight" request, which
    // Apps Script Web Apps don't handle. This keeps calls simple
    // and working without any extra server-side CORS setup.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, params }),
  });
  if (!res.ok) {
    throw new Error("Network error: " + res.status);
  }
  return res.json();
}

export const api = {
  login: (username, pin) => callApi("login", [username, pin]),
  getInitialData: (username) => callApi("getInitialData", [username]),
  addTransaction: (data) => callApi("addTransaction", [data]),
  updateTransaction: (data, adminUsername) =>
    callApi("updateTransaction", [data, adminUsername]),
  deleteTransaction: (id, adminUsername) =>
    callApi("deleteTransaction", [id, adminUsername]),
  addUser: (username, pin, role, adminUsername) =>
    callApi("addUser", [username, pin, role, adminUsername]),
  deleteUser: (username, adminUsername) =>
    callApi("deleteUser", [username, adminUsername]),
  setUserStatus: (username, status, adminUsername) =>
    callApi("setUserStatus", [username, status, adminUsername]),
  updateUserProfile: (currentUsername, newUsername, newPin) =>
    callApi("updateUserProfile", [currentUsername, newUsername, newPin]),
  importBackup: (backup, adminUsername) =>
    callApi("importBackup", [backup, adminUsername]),
  getBackupData: (username) => callApi("getBackupData", [username]),
};
