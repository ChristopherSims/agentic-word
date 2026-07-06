# Lexicon Installer Guide

This guide explains how to install Lexicon from a prebuilt release, run it from source, or build an installer locally.

## Install from a Release

1. Open the Lexicon releases page:
   - https://github.com/ChristopherSims/agentic-word/releases
2. Download the installer for your operating system.
3. Run the installer and follow the platform-specific prompts below.

### Windows

Download one of the Windows release assets:

- NSIS installer, recommended for most users
- Portable EXE, useful when you do not want a full installation

To install:

1. Run the downloaded `.exe`.
2. If Windows SmartScreen appears, choose **More info**, then **Run anyway** if you trust the release.
3. Follow the installer prompts.
4. Launch Lexicon from the Start menu or desktop shortcut.

### macOS

Download the macOS `.dmg` or `.zip` release asset.

To install from a DMG:

1. Open the downloaded `.dmg`.
2. Drag Lexicon into the **Applications** folder.
3. Launch Lexicon from **Applications**.
4. If macOS blocks the app, open **System Settings > Privacy & Security** and allow it, or right-click the app and choose **Open**.

### Linux

Download one of the Linux release assets:

- `.AppImage`, portable and works on most distributions
- `.deb`, for Debian and Ubuntu based distributions

To run an AppImage:

```bash
chmod +x Lexicon*.AppImage
./Lexicon*.AppImage
```

To install a DEB package:

```bash
sudo apt install ./lexicon*.deb
```

## Run from Source

### Prerequisites

Install these first:

- Node.js 20 or newer
- npm
- Git
- Rust toolchain, optional, only needed for the native backend

### Clone and Install

```bash
git clone https://github.com/ChristopherSims/agentic-word.git
cd agentic-word
npm install
```

### Start Development Mode

```bash
npm run dev
```

### Build the App

```bash
npm run build
```

### Build the Optional Native Backend

```bash
npm run build:native
```

Or from the native package directly:

```bash
cd native
npm run build
```

## Build Installers Locally

Install dependencies first:

```bash
npm install
```

Build installers for the current platform:

```bash
npm run dist
```

Build a Windows installer:

```bash
npm run dist:win
```

Build a macOS installer:

```bash
npm run dist:mac
```

Build a Linux installer:

```bash
npm run dist:linux
```

Build installers for all supported platforms:

```bash
npm run dist:all
```

Generated installers are written to the Electron Builder output directory, usually `dist/` or the configured output path.

## Troubleshooting

### Windows installer will not open

- Right-click the installer and choose **Run as administrator**.
- If SmartScreen blocks the installer, choose **More info**, then **Run anyway**.

### macOS says the app is from an unidentified developer

- Right-click Lexicon and choose **Open**.
- Or allow the app in **System Settings > Privacy & Security**.

### Linux AppImage will not run

Make sure it is executable:

```bash
chmod +x Lexicon*.AppImage
```

Some distributions may also require FUSE:

```bash
sudo apt install libfuse2
```

### Dependency installation fails

Try clearing npm state and reinstalling:

```bash
npm cache verify
npm install
```

### Native backend build fails

Make sure Rust is installed:

```bash
rustc --version
cargo --version
```

If Rust is missing, install it from:

```text
https://rustup.rs/
```
