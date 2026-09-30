# Alumnium Helm Chart

Deploys the [Alumnium](https://alumnium.ai) server (`alumnium/alumnium` Docker image) to Kubernetes.

## Install

```bash
helm install alumnium ./charts/alumnium \
  --set config.model=anthropic \
  --set secrets.ANTHROPIC_API_KEY=sk-ant-...
```

Or keep credentials in your own Secret:

```bash
kubectl create secret generic alumnium-llm --from-literal=OPENAI_API_KEY=sk-...
helm install alumnium ./charts/alumnium --set config.model=openai --set existingSecret=alumnium-llm
```

Then point clients at the server:

```bash
kubectl port-forward svc/alumnium 8013:8013
export ALUMNIUM_SERVER_URL=http://127.0.0.1:8013
```

Run `helm test alumnium` to check the `/v1/health` endpoint.

## Configuration

| Key                          | Description                                                                 | Default             |
| ---------------------------- | --------------------------------------------------------------------------- | ------------------- |
| `image.repository`           | Server image                                                                | `alumnium/alumnium` |
| `image.tag`                  | Image tag                                                                   | chart `appVersion`  |
| `config.model`               | `ALUMNIUM_MODEL`, e.g. `anthropic`, `openai/<model>`, `ollama`              | `""`                |
| `config.cache`               | `ALUMNIUM_CACHE` (`filesystem` or `false`)                                  | `filesystem`        |
| `config.logLevel`            | `ALUMNIUM_LOG_LEVEL`                                                        | `""`                |
| `secrets`                    | Map of sensitive env vars (provider API keys) stored in a chart Secret      | `{}`                |
| `existingSecret`             | Existing Secret loaded via `envFrom`                                        | `""`                |
| `env` / `envFrom`            | Extra environment for the server container                                  | `[]`                |
| `extraArgs`                  | Extra `alumnium server` arguments                                           | `[]`                |
| `service.type` / `.port`     | Service type and port                                                       | `ClusterIP` / 8013  |
| `service.sessionAffinity`    | Set to `ClientIP` when running more than one replica                        | `None`              |
| `ingress.*`                  | Optional Ingress                                                            | disabled            |
| `persistence.*`              | PVC for the cache at `/app/.alumnium/cache` (uses `emptyDir` when disabled) | disabled            |
| `resources`, `nodeSelector`, `tolerations`, `affinity` | Standard pod scheduling settings                  | `{}`                |

See [`values.yaml`](values.yaml) for all options.

## Scaling

The server keeps sessions in memory, so a client must reach the same pod for its whole session. Keep `replicaCount: 1`, or set `service.sessionAffinity=ClientIP` and turn on sticky sessions in your ingress controller. A shared cache across replicas needs a `ReadWriteMany` volume (`persistence.accessModes`).

## Security

The server runs as non-root UID/GID `65532` with a read-only root filesystem, no capabilities, no privilege escalation, and the `RuntimeDefault` seccomp profile. This matches the image's `alumnium` user. Because the root filesystem is read-only, the chart mounts writable `emptyDir` volumes at `/app/.alumnium` (logs and store) and `/tmp` (also used as `$HOME`). The cache volume sits on top at `/app/.alumnium/cache`. Change `podSecurityContext` / `securityContext` to pick a different UID.
