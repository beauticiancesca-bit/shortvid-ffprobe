# SHORTVID FFprobe service

Standalone Docker service for detailed media inspection. It installs FFmpeg (including `ffprobe`) in its own container; it does not install FFmpeg into the Zite app runtime.

## Deploy to Render

1. In Render, choose **New → Blueprint** and select this repository.
2. Render detects the root `render.yaml`; create the `shortvid-ffprobe` web service.
3. Wait for the service to become Live. Copy its public URL.
4. In Render → service → Environment, copy the generated `FFPROBE_API_KEY` value. Keep it private.
5. In SHORTVID Admin → MEDIA PROBE, save the service URL and API key.
6. Test with a direct video URL that you own or are authorized to inspect.

The service exposes `GET /health` and authenticated `POST /probe` with JSON `{ "url": "https://..." }`. It returns standard FFprobe `format` and `streams` data. Only HTTP/HTTPS URLs are accepted; localhost and private-network addresses are rejected. Some provider URLs may still fail because of expiry tokens, access controls, geo restrictions, or unsupported headers.

## Local Docker test

```bash
docker build -f services/ffprobe/Dockerfile -t shortvid-ffprobe .
docker run --rm -p 10000:10000 -e FFPROBE_API_KEY='replace-with-a-long-random-secret' shortvid-ffprobe
curl http://localhost:10000/health
curl -X POST http://localhost:10000/probe \
  -H 'Authorization: Bearer replace-with-a-long-random-secret' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/video.mp4"}'
```
