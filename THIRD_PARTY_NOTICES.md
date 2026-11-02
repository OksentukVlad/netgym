# Third-party notices

NetGym's own code is under the MIT licence in [`LICENSE`](LICENSE). The components below are not covered by that licence: each keeps its own licence and copyright, given here. The web build (the GitHub Pages site) ships this file, `OFL.txt` and a page with this text (`third-party-notices.html`), linked from the start screen.

## 1. Shipped in the web build and the app's frontend

These are bundled into the built JavaScript, CSS and font files.

| Component | Version | Licence | Where |
| --- | --- | --- | --- |
| React | 18.3.1 | MIT | bundled JavaScript |
| React DOM | 18.3.1 | MIT | bundled JavaScript |
| scheduler | 0.23.2 | MIT | bundled JavaScript (a React DOM dependency) |
| Vite's module-preload helper | 3.2.11 | MIT | a few lines Vite adds to the bundled JavaScript |
| Wails v2 React template parts | 2.12.0 | MIT | `shell/frontend/src/style.css`, the structure of `shell/main.go`, `shell/frontend/index.html` |
| Nunito Regular (`nunito-v16-latin-regular.woff2`) | v16 | SIL Open Font License 1.1 | `shell/frontend/src/assets/fonts/`, with its `OFL.txt` |

### React, React DOM and scheduler

```text
MIT License

Copyright (c) Facebook, Inc. and its affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Vite (module-preload helper)

```text
MIT License

Copyright (c) 2019-present, Yuxi (Evan) You and Vite contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Wails

The Wails v2 React template parts above, and the Windows packaging files and icons in `shell/build/` (`appicon.png`, `windows/icon.ico`, `windows/info.json`, `windows/wails.exe.manifest`, `windows/installer/project.nsi`, `windows/installer/wails_tools.nsh`), come from Wails v2.12.0 and keep its licence. The app icon is the Wails default icon.

```text
MIT License

Copyright (c) 2018-Present Lea Anthony

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Nunito

The font file is distributed under the SIL Open Font License 1.1, not under the MIT licence. Its full licence, as kept next to the font (`shell/frontend/src/assets/fonts/OFL.txt`, shipped as `OFL.txt` in the web build):

```text
Copyright 2016 The Nunito Project Authors (contact@sansoxygen.com),

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded, 
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## 2. The Windows app only (not in this repository's web build)

`tools/build.sh` compiles these Go modules (from `shell/go.mod`) and the Go standard library (BSD-3-Clause, The Go Authors) into the Windows `.exe`. No `.exe` is published with this repository or the web build; a published `.exe` would need these modules' notices, including nested ones (for example Wails's Apache-2.0 `typescriptify` component and `go-webview2`'s ISC `webviewloader`).

| Go module | Version | Licence |
| --- | --- | --- |
| `github.com/wailsapp/wails/v2` | v2.12.0 | MIT |
| `git.sr.ht/~jackmordaunt/go-toast/v2` | v2.0.3 | Unlicense OR MIT |
| `github.com/bep/debounce` | v1.2.1 | MIT |
| `github.com/go-ole/go-ole` | v1.3.0 | MIT |
| `github.com/godbus/dbus/v5` | v5.1.0 | BSD-2-Clause |
| `github.com/google/uuid` | v1.6.0 | BSD-3-Clause |
| `github.com/gorilla/websocket` | v1.5.3 | BSD-2-Clause |
| `github.com/jchv/go-winloader` | v0.0.0-20210711035445-715c2860da7e | ISC |
| `github.com/labstack/echo/v4` | v4.13.3 | MIT |
| `github.com/labstack/gommon` | v0.4.2 | MIT |
| `github.com/leaanthony/go-ansi-parser` | v1.6.1 | MIT |
| `github.com/leaanthony/gosod` | v1.0.4 | MIT |
| `github.com/leaanthony/slicer` | v1.6.0 | MIT |
| `github.com/leaanthony/u` | v1.1.1 | MIT |
| `github.com/mattn/go-colorable` | v0.1.13 | MIT |
| `github.com/mattn/go-isatty` | v0.0.20 | MIT |
| `github.com/pkg/browser` | v0.0.0-20240102092130-5ac0b6a4141c | BSD-2-Clause |
| `github.com/pkg/errors` | v0.9.1 | BSD-2-Clause |
| `github.com/rivo/uniseg` | v0.4.7 | MIT |
| `github.com/samber/lo` | v1.49.1 | MIT |
| `github.com/tkrajina/go-reflector` | v0.5.8 | Apache-2.0 |
| `github.com/valyala/bytebufferpool` | v1.0.0 | MIT |
| `github.com/valyala/fasttemplate` | v1.2.2 | MIT |
| `github.com/wailsapp/go-webview2` | v1.0.22 | MIT (its webviewloader package: ISC) |
| `github.com/wailsapp/mimetype` | v1.4.1 | MIT |
| `golang.org/x/crypto` | v0.33.0 | BSD-3-Clause |
| `golang.org/x/net` | v0.35.0 | BSD-3-Clause |
| `golang.org/x/sys` | v0.30.0 | BSD-3-Clause |
| `golang.org/x/text` | v0.22.0 | BSD-3-Clause |

## 3. Build and test tools (not shipped)

Development dependencies from `shell/frontend/package-lock.json`, used to build and test NetGym. They are installed with `npm ci` and are not part of the web build or the app. Vite and Rollup carry further notices for code they bundle internally, in their own `LICENSE.md` files.

| Package | Version | Licence |
| --- | --- | --- |
| `@babel/code-frame` | 7.29.7 | MIT |
| `@babel/compat-data` | 7.29.7 | MIT |
| `@babel/core` | 7.29.7 | MIT |
| `@babel/generator` | 7.29.8 | MIT |
| `@babel/helper-annotate-as-pure` | 7.29.7 | MIT |
| `@babel/helper-compilation-targets` | 7.29.7 | MIT |
| `@babel/helper-globals` | 7.29.7 | MIT |
| `@babel/helper-module-imports` | 7.29.7 | MIT |
| `@babel/helper-module-transforms` | 7.29.7 | MIT |
| `@babel/helper-plugin-utils` | 7.29.7 | MIT |
| `@babel/helper-string-parser` | 7.29.11 | MIT |
| `@babel/helper-validator-identifier` | 7.29.7 | MIT |
| `@babel/helper-validator-option` | 7.29.7 | MIT |
| `@babel/helpers` | 7.29.10 | MIT |
| `@babel/parser` | 7.29.11 | MIT |
| `@babel/plugin-syntax-jsx` | 7.29.7 | MIT |
| `@babel/plugin-transform-react-jsx` | 7.29.7 | MIT |
| `@babel/plugin-transform-react-jsx-development` | 7.29.7 | MIT |
| `@babel/plugin-transform-react-jsx-self` | 7.29.7 | MIT |
| `@babel/plugin-transform-react-jsx-source` | 7.29.7 | MIT |
| `@babel/template` | 7.29.7 | MIT |
| `@babel/traverse` | 7.29.10 | MIT |
| `@babel/types` | 7.29.11 | MIT |
| `@esbuild/android-arm` | 0.15.18 | MIT (optional, platform-specific) |
| `@esbuild/linux-loong64` | 0.15.18 | MIT (optional, platform-specific) |
| `@jridgewell/gen-mapping` | 0.3.13 | MIT |
| `@jridgewell/remapping` | 2.3.5 | MIT |
| `@jridgewell/resolve-uri` | 3.1.2 | MIT |
| `@jridgewell/sourcemap-codec` | 1.6.0 | MIT |
| `@jridgewell/trace-mapping` | 0.3.31 | MIT |
| `@types/prop-types` | 15.7.15 | MIT |
| `@types/react` | 18.3.31 | MIT |
| `@types/react-dom` | 18.3.7 | MIT |
| `@vitejs/plugin-react` | 2.2.0 | MIT |
| `baseline-browser-mapping` | 2.11.34 | Apache-2.0 |
| `browserslist` | 4.29.5 | MIT |
| `caniuse-lite` | 1.0.30001820 | CC-BY-4.0 |
| `convert-source-map` | 2.0.0 | MIT |
| `csstype` | 3.2.3 | MIT |
| `debug` | 4.4.3 | MIT |
| `electron-to-chromium` | 1.5.467 | ISC |
| `es-errors` | 1.3.0 | MIT |
| `esbuild` | 0.15.18 | MIT |
| `esbuild-android-64` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-android-arm64` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-darwin-64` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-darwin-arm64` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-freebsd-64` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-freebsd-arm64` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-linux-32` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-linux-64` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-linux-arm` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-linux-arm64` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-linux-mips64le` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-linux-ppc64le` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-linux-riscv64` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-linux-s390x` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-netbsd-64` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-openbsd-64` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-sunos-64` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-windows-32` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-windows-64` | 0.15.18 | MIT (optional, platform-specific) |
| `esbuild-windows-arm64` | 0.15.18 | MIT (optional, platform-specific) |
| `escalade` | 3.2.0 | MIT |
| `fsevents` | 2.3.3 | MIT (optional, platform-specific) |
| `function-bind` | 1.1.2 | MIT |
| `gensync` | 1.0.0-beta.2 | MIT |
| `hasown` | 2.0.4 | MIT |
| `is-core-module` | 2.17.0 | MIT |
| `jsesc` | 3.1.0 | MIT |
| `json5` | 2.2.3 | MIT |
| `lru-cache` | 5.1.1 | ISC |
| `magic-string` | 0.26.7 | MIT |
| `ms` | 2.1.3 | MIT |
| `nanoid` | 3.3.20 | MIT |
| `node-releases` | 2.0.60 | MIT |
| `path-parse` | 1.0.7 | MIT |
| `picocolors` | 1.1.1 | ISC |
| `playwright` | 1.63.0 | Apache-2.0 |
| `playwright-core` | 1.63.0 | Apache-2.0 |
| `postcss` | 8.5.32 | MIT |
| `react-refresh` | 0.14.2 | MIT |
| `resolve` | 1.22.13 | MIT |
| `rollup` | 2.80.0 | MIT |
| `semver` | 6.3.1 | ISC |
| `source-map-js` | 1.2.2 | BSD-3-Clause |
| `sourcemap-codec` | 1.4.8 | MIT |
| `supports-preserve-symlinks-flag` | 1.0.0 | MIT |
| `update-browserslist-db` | 1.3.4 | MIT |
| `vite` | 3.2.11 | MIT |
| `yallist` | 3.1.1 | ISC |

Runtime dependencies of React that are not bundled: `js-tokens` 4.0.0 (MIT), `loose-envify` 1.4.0 (MIT).
