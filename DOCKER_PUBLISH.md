# Vexer Agent - Docker Publishing Guide

## Quick Start (Local Build & Run)

```bash
# Build the image
docker build -f Dockerfile.vexer-agent -t vexer-agent:1.0.0 .

# Run with persistent data
docker run -d --name vexer-agent \
  -p 7090:7090 \
  -v vexer-data:/home/vexer/.vexer-agent \
  vexer-agent:1.0.0

# Access web UI
open http://localhost:7090
```

## Publish to GitHub Container Registry (GHCR) - Free

### 1. Create a GitHub Repository
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/vexer-agent.git
git push -u origin main
```

### 2. Create a Release Tag
```bash
git tag v1.0.0
git push origin v1.0.0
```

### 3. GitHub Actions Auto-Build
The workflow `.github/workflows/docker-build.yml` will automatically:
- Build multi-platform image (linux/amd64)
- Push to `ghcr.io/YOUR_USERNAME/vexer-agent`
- Tag with version and `latest`

### 4. Configure Registry Permissions
1. Go to GitHub repo → Settings → Actions → General
2. Enable "Allow GitHub Actions to create and approve pull requests"
3. Set "Workflow permissions" to "Read and write permissions"

## Publish to Docker Hub

### 1. Create Docker Hub Account
- Go to https://hub.docker.com
- Create account (free)

### 2. Login and Tag
```bash
docker login
docker tag vexer-agent:1.0.0 YOUR_DOCKERHUB_USERNAME/vexer-agent:1.0.0
docker tag vexer-agent:1.0.0 YOUR_DOCKERHUB_USERNAME/vexer-agent:latest
docker push YOUR_DOCKERHUB_USERNAME/vexer-agent:1.0.0
docker push YOUR_DOCKERHUB_USERNAME/vexer-agent:latest
```

### 3. Automated Builds (Optional)
- Go to Docker Hub → Repositories → Create Automated Build
- Connect GitHub repo
- Set build rules for tags/branches

## Using GitHub Container Registry (GHCR) - Recommended

### Pull Image
```bash
# Public image (if repo is public)
docker pull ghcr.io/YOUR_USERNAME/vexer-agent:latest

# Private image (requires login)
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
docker pull ghcr.io/YOUR_USERNAME/vexer-agent:latest
```

### Run from GHCR
```bash
docker run -d --name vexer-agent \
  -p 7090:7090 \
  -v vexer-data:/home/vexer/.vexer-agent \
  ghcr.io/YOUR_USERNAME/vexer-agent:latest
```

## Docker Compose Deployment

```yaml
# docker-compose.yml (already created)
docker-compose up -d

# This starts:
# - vexer-agent (port 7090)
# - Redis (port 6379) - for hot memory
# - ClickHouse (port 8123) - for cold memory
# - Kill Bill (port 8081) - for billing
```

## Build for Multiple Architectures

```bash
# Build for multiple platforms
docker buildx create --use
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/YOUR_USERNAME/vexer-agent:1.0.0 \
  --push .
```

## Verify Image

```bash
# Check image layers
docker history vexer-agent:1.0.0

# Inspect image
docker inspect vexer-agent:1.0.0

# Scan for vulnerabilities
docker scan vexer-agent:1.0.0
```

## Distribution Checklist

- [ ] Build passes locally
- [ ] Image runs correctly
- [ ] Health check passes
- [ ] Web UI accessible on port 7090
- [ ] Multi-arch build works (amd64/arm64)
- [ ] Published to registry
- [ ] Documentation updated
- [ ] Release notes created
