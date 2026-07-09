const DEFAULT_API_ENDPOINT = "http://127.0.0.1:5000";
const API_ENDPOINT = (process.env.REACT_APP_API_ENDPOINT || DEFAULT_API_ENDPOINT).replace(/\/+$/, "");

function isFormDataBody(body) {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

export function defaultHeaders(body) {
  const sessionToken = localStorage.getItem("sessionToken");
  const headers = {};

  if (!isFormDataBody(body)) {
    headers["Content-Type"] = "application/json";
  }

  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  return headers;
}

function updateOptions(options = {}) {
  const update = { ...options };
  const headers = defaultHeaders(update.body);

  update.headers = {
    ...headers,
    ...update.headers,
  };

  if (isFormDataBody(update.body)) {
    delete update.headers["Content-Type"];
  }

  update.credentials = update.credentials || "include";
  return update;
}

export function buildApiUrl(url) {
  return `${API_ENDPOINT}/${String(url).replace(/^\/+/, "")}`;
}

export function getFilenameFromResponse(response, fallbackFilename = "download") {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";\n]+)/i);

  if (!match) {
    return fallbackFilename;
  }

  try {
    return decodeURIComponent(match[1].replace(/"/g, ""));
  } catch (error) {
    void error;
    return match[1].replace(/"/g, "");
  }
}

export async function downloadResponseAsFile(response, fallbackFilename = "download") {
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = getFilenameFromResponse(response, fallbackFilename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function sanitizeTextErrorMessage(text, status) {
  const trimmedText = String(text || "").trim();

  if (!trimmedText) {
    return `Request failed with status ${status}`;
  }

  const looksLikeHtml = /^<!doctype html>/i.test(trimmedText) || /^<html/i.test(trimmedText);
  if (looksLikeHtml) {
    if (status >= 500) {
      return "The server hit an internal error while processing this request.";
    }

    return `Request failed with status ${status}`;
  }

  return trimmedText.replace(/<[^>]+>/g, "").trim() || `Request failed with status ${status}`;
}

async function buildRequestError(response) {
  let message = `Request failed with status ${response.status}`;
  let errorPayload = null;

  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      errorPayload = await response.json();
      message = errorPayload.error || errorPayload.message || message;
    } else {
      const text = await response.text();
      if (text.trim()) {
        message = sanitizeTextErrorMessage(text, response.status);
      }
    }
  } catch (error) {
    void error;
  }

  const requestError = new Error(message);
  requestError.status = response.status;
  requestError.payload = errorPayload;
  return requestError;
}

async function fetcher(url, options = {}, retryCount = 0) {
  void retryCount;

  const response = await fetch(buildApiUrl(url), updateOptions(options));
  if (!response.ok) {
    throw await buildRequestError(response);
  }

  return response;
}

export default fetcher;
