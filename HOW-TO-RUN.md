# How to run the plugin locally

Requires Node 22 or newer (24 recommended, see `.nvmrc`) and Obsidian 1.7.2 or newer.

## 1. Build

```bash
npm install
npm run dev     # watch mode: rebuilds main.js whenever a file in src/ changes
```

Use `npm run build` instead for a one-off production build.

## 2. Install into a vault

Copy the built files into the vault's plugin folder (replace the vault path):

```bash
mkdir -p "/path/to/vault/.obsidian/plugins/gym-plugin"
cp main.js manifest.json styles.css "/path/to/vault/.obsidian/plugins/gym-plugin/"
```

Or, while developing, symlink the repository so every rebuild is picked up without copying:

```bash
ln -s "$(pwd)" "/path/to/vault/.obsidian/plugins/gym-plugin"
```

## 3. Enable it in Obsidian

1. Open **Settings → Community plugins** and turn off **Restricted mode** if it's on.
2. Reload the list of installed plugins (or restart Obsidian).
3. Enable **Gym**.

After a rebuild, switch the plugin off and on again, or run **Reload app without saving** from the command palette (Cmd+R on macOS).
