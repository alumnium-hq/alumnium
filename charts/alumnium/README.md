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
| `ingress.*`                  | Optional Ingress (see [Ingress and TLS](#ingress-and-tls))                  | disabled            |
| `persistence.*`              | PVC for the cache at `/app/.alumnium/cache` (uses `emptyDir` when disabled) | disabled            |
| `resources`, `nodeSelector`, `tolerations`, `affinity` | Standard pod scheduling settings                  | `{}`                |

See [`values.yaml`](values.yaml) for all options.

## Ingress and TLS

The chart creates a standard `networking.k8s.io/v1` Ingress, so any controller works. The example below uses [Traefik](https://doc.traefik.io/traefik/providers/kubernetes-ingress/), with a certificate issued by [cert-manager](https://cert-manager.io/):

```yaml
ingress:
  enabled: true
  className: traefik
  annotations:
    # Serve only over HTTPS. Plain HTTP requests get a 404.
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
    traefik.ingress.kubernetes.io/router.tls: "true"
    cert-manager.io/cluster-issuer: letsencrypt
  hosts:
    - host: alumnium.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: alumnium-tls
      hosts:
        - alumnium.example.com
```

Without cert-manager, create the TLS Secret yourself and drop the `cert-manager.io` annotation:

```bash
kubectl create secret tls alumnium-tls --cert=tls.crt --key=tls.key
```

Point clients at the Ingress host:

```bash
export ALUMNIUM_SERVER_URL=https://alumnium.example.com
```

TLS ends at the ingress controller. Traffic from the controller to the server pod is plain HTTP inside the cluster.

When using a controller other than Traefik, check two of its limits:

- **Request body size.** Each request carries the page's full accessibility tree and can include a screenshot, which often adds up to more than 1 MB. Controllers that limit request bodies reject larger requests with `413`. Traefik has no limit by default.
- **Timeouts.** LLM calls can take more than a minute. Raise the controller's backend response timeout if it defaults to 60s or less (GKE's default is 30s, configured through a `BackendConfig`).

> [!WARNING]
> The server has no authentication. Anyone who can reach the Ingress can make LLM calls billed to your provider keys. Before exposing it outside the cluster, restrict access at the ingress, for example with an IP allowlist, an OAuth2 proxy, or Traefik's `ipAllowList` / `forwardAuth` middleware.

## Scaling

The server keeps sessions in memory, so a client must reach the same pod for its whole session. Keep `replicaCount: 1`, or set `service.sessionAffinity=ClientIP` and turn on sticky sessions in your ingress controller. A shared cache across replicas needs a `ReadWriteMany` volume (`persistence.accessModes`).

## Security

The server runs as the image's non-root `alumnium` user (UID/GID `999`) with a read-only root filesystem, no capabilities, no privilege escalation, and the `RuntimeDefault` seccomp profile. `fsGroup` makes the mounted volumes writable for this UID, so any non-root UID works. Because the root filesystem is read-only, the chart mounts writable `emptyDir` volumes at `/app/.alumnium` (logs and store) and `/tmp` (also used as `$HOME`). The cache volume sits on top at `/app/.alumnium/cache`. Change `podSecurityContext` / `securityContext` to pick a different UID.
