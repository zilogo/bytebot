#!/bin/bash
export HTTPS_PROXY=http://172.16.10.3:10810
export HTTP_PROXY=http://172.16.10.3:10810

now_time=$(date "+%Y%m%d%H%M")
docker buildx build --platform linux/amd64 -t 172.16.10.3:5000/eos3/bytebot-desktop:${now_time} -f ../packages/bytebotd/Dockerfile ../packages/ --push
docker buildx build --platform linux/amd64 -t 172.16.10.3:5000/eos3/bytebot-agent-cc:${now_time} -f ../packages/bytebot-agent-cc/Dockerfile ../packages/ --push
docker buildx build --platform linux/amd64 -t 172.16.10.3:5000/eos3/bytebot-ui:${now_time} -f ../packages/bytebot-ui/Dockerfile ../packages/ --push

docker buildx build --platform linux/arm64 -t 172.16.10.3:5000/eos3/bytebot-desktop:${now_time}-arm64 -f ../packages/bytebotd/Dockerfile ../packages/ --push
docker buildx build --platform linux/arm64 -t 172.16.10.3:5000/eos3/bytebot-agent-cc:${now_time}-arm64 -f ../packages/bytebot-agent-cc/Dockerfile ../packages/ --push
docker buildx build --platform linux/arm64 -t 172.16.10.3:5000/eos3/bytebot-ui:${now_time}-arm64 -f ../packages/bytebot-ui/Dockerfile ../packages/ --push
