import fetcher from "../http/RequestConfig";

export const FALLBACK_LOCAL_MODELS = [
  {
    id: 0,
    key: "qwen3_8b",
    tag: "qwen3:8b",
    label: "Qwen 3 8B",
    description: "Recommended default for local document Q&A.",
    installed: false,
  },
  {
    id: 1,
    key: "llama3_1_8b",
    tag: "llama3.1:8b",
    label: "Llama 3.1 8B",
    description: "Strong general-purpose local model with broad ecosystem support.",
    installed: false,
  },
];

export async function requestLocalModels() {
  try {
    const response = await fetcher("local-models", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: JSON.stringify({}),
    });
    const responseData = await response.json();

    return {
      models: responseData.models?.length ? responseData.models : FALLBACK_LOCAL_MODELS,
      defaultModelType: responseData.default_model_type ?? FALLBACK_LOCAL_MODELS[0].id,
    };
  } catch (error) {
    console.error("Error loading local models:", error);
    return {
      models: FALLBACK_LOCAL_MODELS,
      defaultModelType: FALLBACK_LOCAL_MODELS[0].id,
    };
  }
}

export function getSelectedLocalModel(localModels, modelType) {
  return (
    localModels.find((model) => model.id === modelType) ||
    FALLBACK_LOCAL_MODELS.find((model) => model.id === modelType) ||
    localModels[0] ||
    FALLBACK_LOCAL_MODELS[0]
  );
}

export async function requestLocalModelStatus(modelType) {
  const response = await fetcher("local-model-status", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: JSON.stringify({ model_type: modelType }),
  });

  return response.json();
}

export async function installLocalModel(modelType) {
  const response = await fetcher("install-local-model", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: JSON.stringify({ model_type: modelType }),
  });

  return response.json();
}
