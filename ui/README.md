# NS8 Proxmox Datacenter Manager UI

To develop the UI please refer to [this section of the Developer manual](https://nethserver.github.io/ns8-core/ui/modules/#module-ui-development).

```bash
cd ui
yarn install --immutable
yarn lint
yarn build
yarn test:stack
# Supply core.css extracted from the digest-pinned NS8 core image in CI:
NS8_CORE_CSS=/absolute/path/to/core.css yarn test:e2e
NS8_CORE_CSS=/absolute/path/to/core.css yarn test:e2e:dev
```
