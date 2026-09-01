// Flat config for the extension + tests. Runs under Node in CI; the code
// targets GJS (SpiderMonkey) with GNOME Shell modules.
export default [
    {
        files: ['tailscale-status@maxgallup.github.com/**/*.js', 'tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                // GJS core namespaces (no import needed)
                GLib: 'readonly',
                Gio: 'readonly',
                GObject: 'readonly',
                Gtk: 'readonly',
                Gdk: 'readonly',
                Adw: 'readonly',
                St: 'readonly',
                Clutter: 'readonly',
                Meta: 'readonly',
                Shell: 'readonly',
                Soup: 'readonly',
                cairo: 'readonly',
                print: 'readonly',
                log: 'readonly',
                console: 'readonly',
                imports: 'readonly',
                // SpiderMonkey built-ins
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
                URL: 'readonly',
                // gjs built-in module default export (import System from 'system')
                System: 'writable',
            },
        },
        rules: {
            'no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
            'no-redeclare': 'error',
            'no-var': 'error',
            'prefer-const': ['error', {destructuring: 'all'}],
            'eqeqeq': ['error', 'smart'],
            'no-undef': 'error',
            'no-implicit-globals': 'off', // GNOME modules export by design
        },
    },
    {
        files: ['tailscale-status@maxgallup.github.com/prefs.js'],
        rules: {
            // gjs.guide: prefs process must not import St/Clutter — enforced by
            // the import-restriction test below, not eslint here.
        },
    },
];
