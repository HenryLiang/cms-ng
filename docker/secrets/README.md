# Runtime secrets

Do not store real keys in this directory or in a Docker image. For WeChat Pay,
keep the merchant private key at a protected host path and export
`WECHAT_PAY_PRIVATE_KEY_FILE=/absolute/host/path/apiclient_key.pem` before
running `scripts/docker-prod.sh`. Compose mounts it read-only at the path used
inside the backend container.
