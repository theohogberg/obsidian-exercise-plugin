1. Build it
npm run dev
This starts watch mode — it compiles src/ and outputs main.js whenever you save.

2. Load it in Obsidian

You need to copy the plugin files into an Obsidian vault:
# Create the plugin folder in your vault (replace the path with your actual vault)
mkdir -p "/path/to/your/vault/.obsidian/plugins/gym-plugin"

# Copy the built files
cp main.js manifest.json styles.css "/path/to/your/vault/.obsidian/plugins/gym-plugin/"

Then in Obsidian:
    - Go to Settings → Community Plugins → turn off Restricted Mode (if not already done)
    - Click Reload plugins (or restart Obsidian)
    - Find "Gym Plugin" in the list and enable it

    For active development, a cleaner approach is to symlink the build output directly into the vault so you don't have to copy files on every change:
    ln -s "$(pwd)" "/path/to/your/vault/.obsidian/plugins/gym-plugin"

    Then after each save, just run "Reload app without saving" in Obsidian (Cmd+R on Mac, or via the command palette).

    Do you have an Obsidian vault path you want to use?
