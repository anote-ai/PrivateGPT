import os


LOCAL_CHAT_MODELS = [
    {
        "id": 0,
        "key": "qwen3_8b",
        "tag": "qwen3:8b",
        "label": "Qwen 3 8B",
        "description": "Recommended default for local document Q&A.",
    },
    {
        "id": 1,
        "key": "llama3_1_8b",
        "tag": "llama3.1:8b",
        "label": "Llama 3.1 8B",
        "description": "Strong general-purpose local model with broad ecosystem support.",
    },
]

DEFAULT_CHAT_MODEL_TYPE = int(os.getenv("DEFAULT_LOCAL_CHAT_MODEL_TYPE", "0"))
LOCAL_EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "embeddinggemma")


def get_local_chat_models():
    return [dict(model) for model in LOCAL_CHAT_MODELS]


def normalize_model_type(model_type):
    try:
        candidate = int(model_type)
    except (TypeError, ValueError):
        candidate = DEFAULT_CHAT_MODEL_TYPE

    for model in LOCAL_CHAT_MODELS:
        if model["id"] == candidate:
            return candidate

    return DEFAULT_CHAT_MODEL_TYPE


def resolve_chat_model(model_type):
    normalized_type = normalize_model_type(model_type)
    for model in LOCAL_CHAT_MODELS:
        if model["id"] == normalized_type:
            return dict(model)
    return dict(LOCAL_CHAT_MODELS[0])


def get_fallback_chat_models(model_type):
    preferred = resolve_chat_model(model_type)
    fallbacks = [dict(model) for model in LOCAL_CHAT_MODELS if model["id"] != preferred["id"]]
    return [preferred, *fallbacks]
