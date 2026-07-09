import fetcher, {
  buildApiUrl,
  defaultHeaders,
  downloadResponseAsFile,
  getFilenameFromResponse,
} from "./RequestConfig";

describe("RequestConfig", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("buildApiUrl normalizes leading slashes", () => {
    expect(buildApiUrl("/health")).toBe("http://127.0.0.1:5000/health");
    expect(buildApiUrl("health")).toBe("http://127.0.0.1:5000/health");
  });

  test("defaultHeaders includes auth token for json requests", () => {
    localStorage.setItem("sessionToken", "test-token");

    expect(defaultHeaders()).toEqual({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    });
  });

  test("fetcher keeps FormData uploads free of json content-type", async () => {
    const body = new FormData();
    body.append("file", new Blob(["demo"], { type: "text/plain" }), "demo.txt");

    global.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
    });

    await fetcher("ingest-files/1/demo", {
      method: "POST",
      body,
      headers: { Accept: "application/json" },
    });

    const [, requestOptions] = global.fetch.mock.calls[0];
    expect(requestOptions.headers["Content-Type"]).toBeUndefined();
    expect(requestOptions.headers.Accept).toBe("application/json");
  });

  test("fetcher surfaces backend json errors", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => "application/json" },
      json: async () => ({ error: "Ticker is required." }),
    });

    await expect(fetcher("process-ticker-info", { method: "POST" })).rejects.toMatchObject({
      message: "Ticker is required.",
      status: 400,
    });
  });

  test("fetcher collapses html error pages into a readable message", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => "text/html" },
      text: async () => "<!doctype html><html><body><h1>500 Internal Server Error</h1></body></html>",
    });

    await expect(fetcher("ingest-files/1/demo", { method: "POST" })).rejects.toMatchObject({
      message: "The server hit an internal error while processing this request.",
      status: 500,
    });
  });

  test("getFilenameFromResponse reads content-disposition", () => {
    const response = {
      headers: {
        get: () => 'attachment; filename="chat-history-3.csv"',
      },
    };

    expect(getFilenameFromResponse(response, "fallback.csv")).toBe("chat-history-3.csv");
  });

  test("downloadResponseAsFile triggers a browser download", async () => {
    const click = jest.fn();
    const appendChild = jest.spyOn(document.body, "appendChild").mockImplementation(() => {});
    const createElement = jest.spyOn(document, "createElement").mockReturnValue({
      click,
      remove: jest.fn(),
    });
    const createObjectURL = jest.fn(() => "blob:download");
    const revokeObjectURL = jest.fn();

    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    const response = {
      blob: async () => new Blob(["hello"]),
      headers: {
        get: () => 'attachment; filename="demo.csv"',
      },
    };

    await downloadResponseAsFile(response, "fallback.csv");

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:download");

    createElement.mockRestore();
    appendChild.mockRestore();
  });
});
