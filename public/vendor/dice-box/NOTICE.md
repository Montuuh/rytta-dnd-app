# Third-party: 3D dice

Unmodified build of `@3d-dice/dice-box` 1.1.4 (https://github.com/3d-dice/dice-box), copied from
the npm package's `dist` folder (the `.min.js` files and `assets`). Rytta loads it only when a
Player taps "Tirar por mí" in the group rest panel (RYT-082, `src/shared/ui/dice/`). It is
vendored rather than installed because the package's install script prompts for an assets
folder.

- dice-box: MIT License, Copyright (c) 2021 3Ddice (see `LICENSE`).
- Babylon.js 5.57.1, bundled inside the build: Apache License 2.0, Copyright (c) Babylon.js
  contributors (https://github.com/BabylonJS/Babylon.js/blob/master/license.md).
- ammo.js (`assets/ammo/ammo.wasm.wasm`): zlib License, a port of the Bullet physics engine
  (https://github.com/kripken/ammo.js/blob/main/LICENSE).

To update: `npm pack @3d-dice/dice-box@<version>`, replace these files with the package's
`dist/*.min.js` and `dist/assets`, and keep this notice.
