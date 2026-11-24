# ZONOS3-Mini server (ggml, CPU) for Codenoms speech playback.
# Setup builds this image locally: docker build -t codenoms/zonos:1 server/zonos
# Setup downloads model weights to data/zonos/models and mounts that directory at /models.
FROM rust:1-trixie AS build
RUN apt-get update && apt-get install -y --no-install-recommends cmake git && rm -rf /var/lib/apt/lists/*
ARG ZONOS_REPO=https://github.com/Zyphra/ZONOS3-Mini.git
ARG ZONOS_REF=a50e14117d99181ba7f28047b451ba03ba1a09a9
WORKDIR /src
RUN git init -q . && git remote add origin "$ZONOS_REPO" \
 && git fetch -q --depth 1 origin "$ZONOS_REF" \
 && git -c advice.detachedHead=false checkout -q FETCH_HEAD \
 && git submodule update --init --depth 1 servers/ggml/ggml third_party/zyphra-textnorm
WORKDIR /src/servers/ggml
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF && cmake --build build -j"$(nproc)" --target zonos3-server
# Voice embeddings used for voice design.
RUN mkdir -p /opt/voices && cd /src/assets/default_voices \
 && find . -name '*.embedding.npy' -exec cp --parents {} /opt/voices \;

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/servers/ggml/build/zonos3-server /usr/local/bin/zonos3-server
COPY --from=build /opt/voices /opt/voices
EXPOSE 1919
ENTRYPOINT ["/usr/local/bin/zonos3-server"]
