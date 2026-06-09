const API_ENDPOINT = "http://127.0.0.1:5000";

export function defaultHeaders() {
  const sessionToken = localStorage.getItem("sessionToken");

  return {
    Authorization: `Bearer ${sessionToken}`,
    'Content-Type': 'application/json', // Ensure the Content-Type is set
  };
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

function fetcher(url, options = {}, retryCount = 0) {
  console.log("updateOptions(options)");
  console.log(updateOptions(options));

  return fetch(API_ENDPOINT + "/" + url, updateOptions(options))
    .then(async (response) => {
      if (!response.ok) {
        const responseText = await response.text();
        let errorMessage = responseText || "Network response was not ok";

        try {
          const errorJson = JSON.parse(responseText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch (e) {
          // Keep the plain text error.
        }

        throw new Error(errorMessage);
      }
      return response;
    })
    .catch((error) => {
      console.log("there is an error", error);
      return Promise.reject(error);
    });
}

export default fetcher;
