"""Which local embedding models we know, and how to fetch one ahead of time.

Standalone on purpose (it imports only fastembed): the Docker build runs it before the app's
code is copied in, so the ~470 MB model is downloaded once into its own image layer, not on
every code change or at startup.

    python app/ai/local_models.py intfloat/multilingual-e5-small /opt/models
"""

import sys

# fastembed ships many models; multilingual-e5-small isn't one of them, but its Hugging Face
# repo has an ONNX export, so we register it ourselves. It reads Amharic (XLM-R based).
CUSTOM_MODELS = {
    "intfloat/multilingual-e5-small": {
        "hf": "intfloat/multilingual-e5-small",
        "dim": 384,
        "model_file": "onnx/model.onnx",
        "size_in_gb": 0.47,
    },
}


def register(model_name: str) -> None:
    """Teach fastembed a model from CUSTOM_MODELS (once; repeats are ignored)."""
    spec = CUSTOM_MODELS.get(model_name)
    if spec is None:
        return
    from fastembed import TextEmbedding
    from fastembed.common.model_description import ModelSource, PoolingType

    if any(m["model"] == model_name for m in TextEmbedding.list_supported_models()):
        return
    TextEmbedding.add_custom_model(
        model=model_name,
        pooling=PoolingType.MEAN,  # e5 averages its token vectors
        normalization=True,
        sources=ModelSource(hf=spec["hf"]),
        dim=spec["dim"],
        model_file=spec["model_file"],
        size_in_gb=spec["size_in_gb"],
    )


def download(model_name: str, cache_dir: str | None) -> None:
    from fastembed import TextEmbedding

    register(model_name)
    model = TextEmbedding(model_name, cache_dir=cache_dir or None)
    list(model.embed(["passage: warm up"]))  # proves the files load, not just download


if __name__ == "__main__":
    download(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
