const API_ENDPOINT = "http://127.0.0.1:5000";

export function defaultHeaders() {
  const sessionToken = localStorage.getItem("sessionToken");
  const headers = {
    'Content-Type': 'application/json',
  };

  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  return headers;
}

function updateOptions(options) {
  const update = { ...options };
  const headers = defaultHeaders();
  update.headers = {
    ...headers,
    ...update.headers,
  };
  update.credentials = "include";
  return update;
}

function buildUrl(url) {
  return `${API_ENDPOINT}/${String(url).replace(/^\/+/, "")}`;
}

function fetcher(url, options = {}, retryCount = 0) {
  void retryCount;
  return fetch(buildUrl(url), updateOptions(options))
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response;
    })
    .catch((error) => {
      return Promise.reject(error);
    });
}

export default fetcher;
