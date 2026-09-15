const API_BASE_URL = "https://kudivoice.onrender.com";

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("kudivoice_token");

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    // response had no JSON body
  }

  if (!response.ok) {
    const message = (data && data.error) || "Something went wrong. Please try again.";
    throw new Error(message);
  }

  return data;
}

function saveToken(token) {
  localStorage.setItem("kudivoice_token", token);
}

function getToken() {
  return localStorage.getItem("kudivoice_token");
}

function clearToken() {
  localStorage.removeItem("kudivoice_token");
}

function saveBusinessName(name) {
  localStorage.setItem("kudivoice_business_name", name);
}

function getBusinessName() {
  return localStorage.getItem("kudivoice_business_name") || "there";
}

function saveEmail(email) {
  localStorage.setItem("kudivoice_email", email);
}

function getEmail() {
  return localStorage.getItem("kudivoice_email") || "";
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = "login.html";
  }
}

function logout() {
  clearToken();
  localStorage.removeItem("kudivoice_business_name");
  localStorage.removeItem("kudivoice_email");
  window.location.href = "login.html";
}