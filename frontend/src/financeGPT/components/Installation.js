import React, { useEffect, useState } from "react";
import "../styles/Chatbot.css";
import fetcher from "../../http/RequestConfig";
import { useNavigate } from "react-router-dom";

const MODELS = [
  {
    key: "llama2",
    name: "LLaMA 2",
    existsKey: "llama2_exists",
    installEndpoint: "install-llama",
    statusEndpoint: "llama-status",
  },
  {
    key: "mistral",
    name: "Mistral",
    existsKey: "mistral_exists",
    installEndpoint: "install-mistral",
    statusEndpoint: "mistral-status",
  },
];

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function Installation({ modelStatus = {}, onModelsReady, refreshModels }) {
  const navigate = useNavigate();
  const [models, setModels] = useState({
    llama2_exists: Boolean(modelStatus.llama2_exists),
    mistral_exists: Boolean(modelStatus.mistral_exists),
  });
  const [installingModel, setInstallingModel] = useState("");
  const [progressByModel, setProgressByModel] = useState({
    llama2: 0,
    mistral: 0,
  });
  const [timeLeftByModel, setTimeLeftByModel] = useState({
    llama2: "",
    mistral: "",
  });
  const [statusMessage, setStatusMessage] = useState("");

  const allModelsReady = models.llama2_exists && models.mistral_exists;

  useEffect(() => {
    setModels({
      llama2_exists: Boolean(modelStatus.llama2_exists),
      mistral_exists: Boolean(modelStatus.mistral_exists),
    });
  }, [modelStatus.llama2_exists, modelStatus.mistral_exists]);

  useEffect(() => {
    if (!refreshModels || allModelsReady || installingModel) {
      return undefined;
    }

    let isCancelled = false;

    const refresh = async () => {
      const latestStatus = await refreshModels();

      if (!isCancelled) {
        setModels({
          llama2_exists: Boolean(latestStatus.llama2_exists),
          mistral_exists: Boolean(latestStatus.mistral_exists),
        });
      }
    };

    refresh();
    const intervalId = setInterval(refresh, 3000);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [allModelsReady, installingModel, refreshModels]);

  useEffect(() => {
    if (allModelsReady) {
      onModelsReady?.();
    }
  }, [allModelsReady, onModelsReady]);

  const goToHomeChatbot = () => {
    if (!allModelsReady) {
      setStatusMessage("Install both local models before continuing.");
      return;
    }

    onModelsReady?.();
    navigate("/chatbot");
  };

  const refreshModelStatus = async () => {
    if (!refreshModels) {
      return models;
    }

    const latestStatus = await refreshModels();
    const nextModels = {
      llama2_exists: Boolean(latestStatus.llama2_exists),
      mistral_exists: Boolean(latestStatus.mistral_exists),
    };

    setModels(nextModels);
    return nextModels;
  };

  const pollInstallStatus = async (model) => {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const response = await fetcher(model.statusEndpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      const status = await response.json();
      const progress = Number.isFinite(status.progress) ? status.progress : 0;

      setProgressByModel((previous) => ({
        ...previous,
        [model.key]: progress,
      }));
      setTimeLeftByModel((previous) => ({
        ...previous,
        [model.key]: status.time_left || "",
      }));

      if (status.error) {
        throw new Error(status.error);
      }

      if (!status.running && status.completed) {
        return status;
      }

      await wait(3000);
    }

    throw new Error(`${model.name} installation timed out.`);
  };

  const installModel = async (model) => {
    if (installingModel) {
      return;
    }

    setInstallingModel(model.key);
    setProgressByModel((previous) => ({ ...previous, [model.key]: 0 }));
    setTimeLeftByModel((previous) => ({ ...previous, [model.key]: "" }));
    setStatusMessage(`Starting ${model.name} download...`);

    try {
      const response = await fetcher(model.installEndpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      const responseData = await response.json();

      if (!responseData.success) {
        throw new Error(responseData.message);
      }

      setStatusMessage(`${model.name} is downloading through Ollama...`);
      await pollInstallStatus(model);
      setProgressByModel((previous) => ({ ...previous, [model.key]: 100 }));

      const latestModels = await refreshModelStatus();
      const installed = latestModels[model.existsKey];
      setStatusMessage(
        installed
          ? `${model.name} is installed.`
          : `${model.name} finished downloading, but was not detected yet.`
      );
    } catch (e) {
      console.error("Installation failed:", e);
      setStatusMessage(`Could not install ${model.name}. ${e.message}`);
    } finally {
      setInstallingModel("");
      setTimeLeftByModel((previous) => ({ ...previous, [model.key]: "" }));
    }
  };

  return (
    <div className="text-white min-h-screen px-8 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-center pt-4">
          <img src="logo.png" className="w-10 h-10" alt="logo" />
          <h1 className="text-4xl font-semibold">Private GPT</h1>
        </div>
        <h2 className="text-2xl text-center text-lime-300 font-semibold my-2 mb-10">
          Chat with your financial documents
        </h2>

        <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Local models</h3>
              <p className="text-sm text-gray-300">
                Ollama is required before Private GPT can answer with local models.
              </p>
            </div>
            <button
              onClick={refreshModelStatus}
              disabled={Boolean(installingModel)}
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Refresh
            </button>
          </div>

          <a
            className="mt-5 inline-block text-sm font-semibold text-sky-300 underline"
            target="_blank"
            rel="noopener noreferrer"
            href="https://ollama.com/download"
          >
            Download Ollama
          </a>

          <div className="mt-5 flex flex-col gap-3">
            {MODELS.map((model) => {
              const isInstalled = models[model.existsKey];
              const isInstalling = installingModel === model.key;
              const progress = progressByModel[model.key];
              const timeLeft = timeLeftByModel[model.key];

              return (
                <div
                  key={model.key}
                  className="rounded-lg border border-gray-700 bg-gray-900 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold">{model.name}</div>
                      <div className="text-sm text-gray-300">
                        {isInstalled ? "Installed" : "Missing"}
                        {isInstalling && timeLeft ? ` - ${timeLeft} remaining` : ""}
                      </div>
                    </div>

                    <button
                      onClick={() => installModel(model)}
                      disabled={isInstalled || Boolean(installingModel)}
                      className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-300"
                    >
                      {isInstalled ? "Installed" : `Install ${model.name}`}
                    </button>
                  </div>

                  {isInstalling && (
                    <div className="mt-4 h-3 overflow-hidden rounded-lg bg-gray-700">
                      <div
                        className="h-full rounded-lg bg-lime-400 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {statusMessage && (
            <div className="mt-5 rounded-lg bg-gray-700 px-4 py-3 text-sm text-gray-100">
              {statusMessage}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={goToHomeChatbot}
              disabled={!allModelsReady}
              className="rounded-lg bg-lime-400 px-5 py-3 text-sm font-semibold text-gray-950 hover:bg-lime-300 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-300"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Installation;
