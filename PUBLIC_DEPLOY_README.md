# Vexer Agent - Public Docker Deployment

## 🚀 One-Command Public Deploy

```bash
# 1. Login to GHCR (free, uses GitHub token)
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# 2. Build & Push (replace YOUR_USERNAME)
./quick-deploy.sh YOUR_GITHUB_USERNAME

# Done! Public at: ghcr.io/YOUR_USERNAME/vexer-agent:latest
```

---

## 📋 Prerequisites

1. **GitHub Account** (free)
2. **GitHub Token** with `write:packages` scope:
   - Go to: https://github.com/settings/tokens
   - Generate new token (classic)
   - Check: `write:packages`, `read:packages`, `delete:packages`
   - Copy token

2. **Docker installed** and running

---

## 🎯 Quick Start (3 Commands)

```bash
# 1. Export your GitHub token
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"

# 2. Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# 3. Build & Push (one command)
./quick-deploy.sh YOUR_GITHUB_USERNAME
```

**Done!** Image is now public at:
```
ghcr.io/YOUR_USERNAME/vexer-agent:latest
```

---

## 🌍 Anyone Can Now Run

```bash
docker pull ghcr.io/YOUR_USERNAME/vexer-agent:latest
docker run -d -p 7090:7090 ghcr.io/YOUR_USERNAME/vexer-agent:latest
```

---

## 📦 What's Included (49MB)

- ✅ Vexer Agent Core (standalone)
- ✅ Identity + Knowledge Base
- ✅ Credit System (1 USD = 0.1 credit)
- ✅ Memory System (hot/cold tiers)
- ✅ Self-Learning Engine
- ✅ Threat Intelligence
- ✅ Web UI (React)
- ✅ All deps bundled

---

## 🔄 Auto-Build on GitHub (Optional)

Push to GitHub, tag a release, and GitHub Actions builds/pushes automatically:

```bash
git init
git add .
git commit -m "Initial"
git remote add origin https://github.com/YOUR_USERNAME/vexer-agent.git
git push -u origin main
git tag v1.0.0 && git push origin v1.0.0
# GitHub Actions builds & publishes automatically
```

---

## 📁 Files Ready

| File | Description |
|------|-------------|
| `Dockerfile.vexer-agent` | Multi-stage build |
| `docker-compose.yml` | Full stack |
| `.github/workflows/docker-build.yml` | Auto-build on tag |
| `quick-deploy.sh` | One-command deploy |
| `DOCKER_PUBLISH.md` | Full guide |

---

## 🌐 Result

Anyone worldwide can run:
```bash
docker run -d -p 7090:7090 ghcr.io/YOUR_USERNAME/vexer-agent:latest
```

**Web UI at:** http://localhost:7090
